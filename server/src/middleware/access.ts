import type { RequestHandler } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config/env.js';

/** Identity asserted by Cloudflare Access for the calling user. */
export interface AccessIdentity {
  email: string;
  sub: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    accessIdentity?: AccessIdentity;
  }
}

const TOKEN_HEADER = 'Cf-Access-Jwt-Assertion';
const TOKEN_COOKIE = 'CF_Authorization';

function cookieToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === TOKEN_COOKIE) return rest.join('=');
  }
  return undefined;
}

/**
 * Verifies the Cloudflare Access token on every request.
 *
 * Access terminates auth at the edge, but the token is re-verified here
 * against the team's JWKS so that a request arriving by any other route — a
 * misconfigured tunnel, a container port left exposed — is still rejected.
 * This matters more than usual because the Access application must have
 * "Bypass OPTIONS requests to origin" enabled for CORS preflight to work.
 */
export function createAccessGuard(): RequestHandler {
  const { teamDomain, audience, required } = config.access;

  if (!teamDomain || !audience) {
    if (required) {
      throw new Error(
        'CF_ACCESS_REQUIRED=true but CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD are not set',
      );
    }
    console.warn('[access] Cloudflare Access verification disabled (no team domain / audience)');
    return (_req, _res, next) => next();
  }

  const issuer = `https://${teamDomain}`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));

  return async (req, res, next) => {
    const token = req.header(TOKEN_HEADER) ?? cookieToken(req.header('cookie'));
    if (!token) {
      if (!required) return next();
      return res.status(401).json({
        error: 'Sign-in required',
        code: 'ACCESS_REQUIRED',
        hint: 'This API is protected by Cloudflare Access. Open the app and sign in again.',
      });
    }

    try {
      const { payload } = await jwtVerify(token, jwks, { issuer, audience });
      req.accessIdentity = {
        email: typeof payload.email === 'string' ? payload.email : '',
        sub: typeof payload.sub === 'string' ? payload.sub : '',
      };
      next();
    } catch (err) {
      console.warn('[access] token rejected:', err instanceof Error ? err.message : err);
      res.status(403).json({ error: 'Invalid or expired sign-in', code: 'ACCESS_INVALID' });
    }
  };
}

/** Verifies the same token for a Socket.IO handshake. */
export function verifyAccessToken(): (token: string | undefined) => Promise<AccessIdentity | null> {
  const { teamDomain, audience, required } = config.access;
  if (!teamDomain || !audience) {
    return async () => (required ? null : { email: '', sub: '' });
  }

  const issuer = `https://${teamDomain}`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));

  return async (token) => {
    if (!token) return required ? null : { email: '', sub: '' };
    try {
      const { payload } = await jwtVerify(token, jwks, { issuer, audience });
      return {
        email: typeof payload.email === 'string' ? payload.email : '',
        sub: typeof payload.sub === 'string' ? payload.sub : '',
      };
    } catch {
      return null;
    }
  };
}

export { TOKEN_HEADER, cookieToken };

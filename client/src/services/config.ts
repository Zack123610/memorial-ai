/**
 * Where the API lives.
 *
 * Empty in development: Vite proxies /api and /socket.io to the Express server,
 * so requests stay same-origin. In production the client is served from
 * Cloudflare Pages and the API from a separate tunnel hostname, which makes
 * every call cross-origin — hence `credentials: 'include'` at the call sites,
 * without which the browser would withhold the Cloudflare Access cookie.
 */
function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export const apiBase = trimTrailingSlash(import.meta.env.VITE_API_BASE ?? '');

export const socketUrl = trimTrailingSlash(import.meta.env.VITE_SOCKET_URL ?? apiBase);

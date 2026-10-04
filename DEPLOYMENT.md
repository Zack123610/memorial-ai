# Deploying Memorial AI

Production topology for the private-testing phase: the React client on
Cloudflare Pages, everything else in Docker on a home server (UGREEN NASync
DXP4800 Pro), reachable only through a Cloudflare Tunnel gated by Cloudflare
Access.

Hostnames for `zackee.dev`:

- SPA: `https://memorial-ai.zackee.dev` (Cloudflare Pages)
- API: `https://memorial-api.zackee.dev` (Cloudflare Tunnel)

Both sit under `zackee.dev`, so the browser treats them as the same site and
will send the Access cookie on API calls. The API uses its own subdomain so
`api.zackee.dev` stays free for anything else.

> The API hostname must stay **one level deep**. Cloudflare's free Universal
> SSL certificate only covers `zackee.dev` and `*.zackee.dev`; a nested name
> like `api.memorial-ai.zackee.dev` gets an SSL handshake failure at the edge
> unless you pay for Advanced Certificate Manager or Total TLS.

```
                        ┌──────────────────────────────────┐
  browser ─────────────▶│ memorial-ai.zackee.dev           │  Pages, static SPA
                        └──────────────────────────────────┘
      │
      │ XHR + WebSocket (credentials: include)
      ▼
  ┌────────────────────────────────────────┐
  │ memorial-api.zackee.dev             │  Access: any GitHub account
  │ Cloudflare Tunnel                      │
  └──────────────────┬─────────────────────┘
                     │ outbound-only, no open ports
  ┌──────────────────▼─────────────────────────────────────┐
  │ NAS — docker-compose-prod.yml                          │
  │                                                        │
  │  edge network:     cloudflared ─▶ server:3001          │
  │  private network:  server ─▶ tts:8200                  │
  │                    server ─▶ video:8300                │
  │                    server ─▶ redis:6379                │
  └────────────────────────────────────────────────────────┘
                     │                       │
                     ▼                       ▼
              DashScope (Beijing)      S3 (presigned URLs)
```

Two deliberate choices:

- **`tts` and `video` are not on the `edge` network.** cloudflared cannot route
  to them at all, so the DashScope API key is unreachable from the internet
  even if the API container is compromised.
- **The finished video is served to the browser straight from S3**, never
  through the tunnel. Cloudflare's service-specific terms prohibit serving
  video through the CDN on Free/Pro/Business plans without an eligible paid
  service, so do not "simplify" this by proxying media through Express.

---

## 1. Prerequisites

- `zackee.dev` on Cloudflare, which it already is.
- Docker with Compose on the NAS. On UGOS Pro: App Center → Docker, then use
  the Docker app's **Project** feature or SSH in and run Compose directly.
- The three `.env` files filled in, copied to the NAS alongside the repo:
  `.env`, `tts-service/.env`, `video-service/.env`.

## 2. Cloudflare Tunnel

1. Zero Trust dashboard → **Networking → Tunnels → Create a tunnel** →
   **Cloudflared**. Name it `memorial-ai`.
2. Copy the tunnel token and put it in the repo-root `.env`:
   ```
   TUNNEL_TOKEN=eyJhIjoi...
   ```
3. Under **Routes → Add route → Published application**:
   - Subdomain: `memorial-api`
   - Domain: `zackee.dev`
   - Service URL: `http://server:3001`

   `server` is the Compose service name; cloudflared resolves it over the
   shared `edge` network, so no host ports need publishing.

WebSocket support is enabled by default on proxied Cloudflare traffic, which is
what Socket.IO needs.

## 3. Cloudflare Access

Sign-in is "Continue with GitHub". There is no email list to maintain: anyone
with a GitHub account can open the app, and everyone else never reaches it.
The existing quotas (`QUOTA_USER_HOUR`, `QUOTA_USER_DAY`, `QUOTA_GLOBAL_DAY`)
are what bound DashScope spend if the URL spreads. The free Access plan covers
50 distinct users; the 51st GitHub account cannot sign in until you remove
someone or move off the free plan.

### 3.1 GitHub as the login method

You do not need a GitHub organization.

1. Zero Trust → **Settings → Custom Pages** (or **Team name and domain**) shows
   your team name. The team domain is `https://<team-name>.cloudflareaccess.com`.
   Note it.
2. On GitHub: **Settings → Developer settings → OAuth Apps → New OAuth App.**
   - Application name: `Memorial AI`
   - Homepage URL: `https://<team-name>.cloudflareaccess.com`
   - Authorization callback URL:
     `https://<team-name>.cloudflareaccess.com/cdn-cgi/access/callback`
3. Register the app, copy the **Client ID**, then **Generate a new client secret**
   and copy that too. The secret is shown once.
4. Zero Trust → **Integrations → Identity providers → Add new identity provider
   → GitHub.** Paste the Client ID as App ID and the client secret, then Save.
5. **Finish setup** and authorize the two read-only scopes GitHub asks for
   (organizations and teams, email addresses). Then use **Test** next to the
   GitHub provider. If your own GitHub account has 2FA, sign in to GitHub in
   that browser first or the test bounces.

### 3.2 The application

1. **Access → Applications → Add an application → Self-hosted.**
2. Add **both** hostnames to this _one_ application:
   - `memorial-ai.zackee.dev` (the Pages site)
   - `memorial-api.zackee.dev` (the tunnel)

   One application covering both means a single GitHub sign-in issues a
   `CF_Authorization` cookie for each. Leave **Eager redirect cookie** on so
   the cookie for `memorial-api.zackee.dev` exists before the SPA makes its
   first request. Two separate applications would force users to log in twice,
   and the SPA's first API call would fail.

3. Turn on **Bypass OPTIONS requests to origin.**

   This is mandatory, not optional. Browsers never attach cookies to CORS
   preflight `OPTIONS` requests, so Access would reject the preflight with a
   403 and the multipart `POST /api/jobs` would fail before it ever reached the
   server. Because preflights now skip Access, the API re-verifies the Access
   JWT itself — see the env vars below.

4. Policy: **Allow**, with a single include rule:

   | Rule    | Selector      | Value  |
   | ------- | ------------- | ------ |
   | Include | Login Methods | GitHub |

   That is the whole allowlist. A later narrowing to one GitHub organization is
   a second include or require rule in this same screen; the app does not change.

5. On the application overview, copy the **Application Audience (AUD) tag**
   into the repo-root `.env`:
   ```
   CF_ACCESS_TEAM_DOMAIN=<team-name>.cloudflareaccess.com
   CF_ACCESS_AUD=<aud tag>
   CF_ACCESS_REQUIRED=true
   ```
   The server verifies every request's `Cf-Access-Jwt-Assertion` against your
   team's JWKS. Access already checks this at the edge; doing it again at the
   origin means a request that arrives by any other path is still rejected.
   The GitHub email inside that token is what the per-user quota keys off.

## 4. The NAS stack

In the repo-root `.env`, point CORS at the Pages hostname:

```
NODE_ENV=production
CORS_ORIGINS=https://memorial-ai.zackee.dev
```

Then bring it up:

```bash
docker compose -f docker-compose-prod.yml up -d --build
docker compose -f docker-compose-prod.yml ps
docker compose -f docker-compose-prod.yml logs -f server
```

Nothing is published to the host. To reach the API from the NAS itself for
debugging:

```bash
docker compose -f docker-compose-prod.yml exec server \
  node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>r.text()).then(console.log)"
```

## 5. Cloudflare Pages

1. Pages → **Create a project → Connect to Git** → pick this repo.
2. Build settings:
   | Setting | Value |
   | --- | --- |
   | Framework preset | None |
   | Build command | `npm install && npm run build --workspace client` |
   | Build output directory | `client/dist` |
   | Root directory | _(leave as the repo root)_ |
3. Environment variables (Production **and** Preview):
   ```
   NODE_VERSION   = 20
   VITE_API_BASE  = https://memorial-api.zackee.dev
   VITE_SOCKET_URL= https://memorial-api.zackee.dev
   ```
   These are read at build time, so changing them needs a redeploy.
4. **Custom domains → Set up a custom domain** → `memorial-ai.zackee.dev`.

`client/public/_redirects` handles SPA deep links such as `/jobs/<uuid>`.

One thing to know: Access protects `memorial-ai.zackee.dev`, but per-deployment
preview URLs like `<hash>.memorial-ai.pages.dev` are not covered by that
policy. That is harmless here — the SPA contains no secrets and is useless
without the API, which does require Access — but don't treat a `pages.dev` URL
as private.

## 6. Tailscale for NAS admin

Deliberately separate from the public tunnel: this path is for you, not for app
users. Never route the UGOS admin panel or SSH through the Cloudflare tunnel.

Either install Tailscale from the UGOS App Center, or use the bundled Compose
service. The service ships commented out in `docker-compose-prod.yml` —
uncomment the whole block (including `profiles: [tailscale]` and the
`tailscale-state` volume) first. Generate an auth key in the Tailscale admin
console, then:

```bash
# in .env
TS_AUTHKEY=tskey-auth-...
TS_HOSTNAME=memorial-nas
TS_ROUTES=192.168.1.0/24   # your LAN, so the whole subnet is reachable

docker compose -f docker-compose-prod.yml --profile tailscale up -d
```

Approve the advertised subnet route in the Tailscale admin console. The free
Personal plan allows 6 users and unlimited devices; note it is licensed for
non-commercial use only.

## 7. Verify

```bash
# Health is intentionally unauthenticated, so this should answer from anywhere.
curl -s https://memorial-api.zackee.dev/api/health | jq

# Generation is not. Expect 401 with code ACCESS_REQUIRED.
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://memorial-api.zackee.dev/api/jobs
```

Then in a browser: open `https://memorial-ai.zackee.dev`, sign in with GitHub,
and run one full generation. Confirm that progress updates arrive (that proves
the authenticated WebSocket works) and that the finished video plays.

## 8. Cost

| Item              | Cost                                                |
| ----------------- | --------------------------------------------------- |
| Cloudflare Pages  | $0 — unlimited bandwidth/requests, 500 builds/month |
| Cloudflare Tunnel | $0                                                  |
| Cloudflare Access | $0 up to 50 users                                   |
| Domain            | ~$10/year (Cloudflare Registrar sells at cost)      |
| NAS electricity   | ~20–30 W continuous                                 |
| DashScope         | ~US$0.60 per 15s 720P video, plus voice cloning     |
| AWS S3            | storage + ~$0.09/GB egress                          |

The last two are the only ones that scale with use. `QUOTA_GLOBAL_DAY` in
`.env` is the hard ceiling on daily DashScope spend; at the default of 25 jobs
that is roughly US$15/day worst case.

Moving the bucket to Cloudflare R2 would eliminate the S3 egress line (10 GB
storage free, zero egress). `video-service` is ready for it — set
`S3_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com` and
`S3_REGION=auto`.

## 9. Known limits

- **Single instance.** The pipeline runs in the API process. Don't scale
  `server` past one replica; job progress would fan out incorrectly.
- **Restart recovery is partial.** Job state lives in Redis, so jobs survive an
  API restart, and a job already submitted to the video service resumes
  polling. But `video-service` keeps _its_ jobs in memory, so restarting that
  container (including a full `up -d` that recreates everything) loses the
  in-flight DashScope task and the job fails with a clear message.
- **Presigned URLs expire.** Inputs last an hour, outputs 7 days
  (`S3_OUTPUT_URL_TTL`, the SigV4 maximum), matched to the server's
  `JOB_TTL_SECONDS` so a job record and its video expire together.
- **No payment or abuse protection beyond quotas.** Fine while the email
  allowlist is the gate. Before opening up publicly, replace Access with
  Cloudflare Turnstile plus a WAF rate-limiting rule on `/api/jobs`, and
  re-point CORS.

## 10. Troubleshooting

**CORS error on `POST /api/jobs`, or a 403 on the preflight.** "Bypass OPTIONS
requests to origin" is off on the Access application, or `CORS_ORIGINS` does
not exactly match the Pages origin (scheme included, no trailing slash).

**Requests succeed from `memorial-api.zackee.dev` directly but fail from the app.** The
two hostnames are in separate Access applications. Put both in one, with eager
redirect cookies on.

**401 `ACCESS_REQUIRED` while signed in.** The browser isn't sending the cookie
cross-origin. Check that the client was built with `VITE_API_BASE` set and that
both hostnames sit under the same apex domain.

**`job storage is unavailable`.** Redis is down; check
`docker compose -f docker-compose-prod.yml logs redis`.

**WebSocket connects then immediately disconnects.** The handshake failed Access
verification. Confirm `CF_ACCESS_AUD` matches the application serving
`memorial-api.zackee.dev`.

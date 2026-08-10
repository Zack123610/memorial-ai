# AGENTS.md

## Cursor Cloud specific instructions

Memorial AI is a monorepo with four services. Standard setup/run/lint/build commands live in
[`README.md`](./README.md), [`DEVELOPMENT.md`](./DEVELOPMENT.md), and each service's README —
reference those instead of duplicating them here. Node deps (`npm install`) and Python deps
(`uv sync` per service) are refreshed by the startup update script, so you usually only need to
start services.

### Services

| Service          | Dir             | Port | Start (dev)                                                           |
| ---------------- | --------------- | ---- | --------------------------------------------------------------------- |
| Client (React)   | `client`        | 5173 | `npm run dev` at repo root (runs client + server together)            |
| Server (Express) | `server`        | 3001 | same `npm run dev`                                                    |
| tts-service      | `tts-service`   | 8200 | `uv run uvicorn app.main:app --host 127.0.0.1 --port 8200` in the dir |
| video-service    | `video-service` | 8300 | `uv run uvicorn app.main:app --host 127.0.0.1 --port 8300` in the dir |

Health checks: server `GET /api/health`, tts `GET /health`, video `GET /api/v1/health`.

### Non-obvious caveats

- `uv` is installed at `~/.local/bin` and added to `~/.bashrc`. Non-interactive shells may not
  source it, so use `~/.local/bin/uv` (or ensure `~/.local/bin` is on `PATH`) when scripting.
- Redis / Docker are **not** required for the web app. The `server` uses an in-memory `JobStore`
  (BullMQ/Redis is a deferred phase), so `docker compose up redis` is optional and can be skipped.
- The two Python AI services are thin clients over Aliyun **DashScope** and need a
  `DASHSCOPE_API_KEY` to actually clone voices / generate video; `video-service` additionally
  needs S3 credentials + bucket. Without those secrets both services still start and pass their
  health checks, but any real `POST /clone` or `POST /api/v1/jobs` work fails (tts returns
  `503 DASHSCOPE_API_KEY not configured`). Set the keys in each service's `.env`
  (`tts-service/.env`, `video-service/.env`) — copy from the committed `.env.example` files.
- The full generation flow is: client form → server `POST /api/jobs` → in-process pipeline →
  `tts-service` (clone) → `video-service` (Wan2.7 i2v). Without a DashScope key the job created
  by the UI immediately transitions to `failed` at the voice-cloning stage — this is expected,
  not an app/plumbing bug.
- `.env` files are gitignored and only carry non-secret defaults for startup; the app runs on
  built-in defaults even if they are absent, so missing `.env` is not a blocker for starting
  services.

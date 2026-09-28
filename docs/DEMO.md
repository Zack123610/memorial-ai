# Memorial AI — Demo checklist (Phase 4)

Use this before recording or presenting the Milestone 1 demo.

## Prerequisites

- [ ] Node 20+, `uv`, Docker
- [ ] Root `.env` present (`cp .env.example .env`)
- [ ] `tts-service/.env` with `DASHSCOPE_API_KEY` (+ matching `TTS_DASHSCOPE_BASE`)
- [ ] `video-service/.env` with same key, S3 bucket creds, and public bucket access
- [ ] Redis up: `docker compose up -d redis` (optional for current MVP)

## Start services

```bash
# Terminal 1 — client + Express
npm run dev

# Terminal 2 — TTS
cd tts-service && uv sync && uv run uvicorn app.main:app --host 127.0.0.1 --port 8200

# Terminal 3 — Video
cd video-service && uv sync && uv run uvicorn app.main:app --host 127.0.0.1 --port 8300
```

## Smoke checks

```bash
# Unit + API validation (server must be running for API checks)
npm run test:e2e

# Optional full generation (uses DashScope credits)
E2E_LIVE=1 npm run test:e2e
```

- [ ] `GET http://localhost:3001/api/health` reports `downstream.tts` and `downstream.video`
- [ ] Create form rejects short/long voice samples and overlong farewell text
- [ ] Happy path: clear portrait + 10–20s voice + matching transcript → playable video
- [ ] Failed job shows a readable error and “Try again”
- [ ] Refreshing a job URL after server restart shows “Job expired”

## Demo script (≈3 minutes)

1. Open landing → Begin
2. Upload a clear front-facing photo
3. Upload a 10–20s clean voice clip; paste the exact transcript
4. Enter a short farewell (under ~800 characters)
5. Submit and narrate the progress stages (queued → cloning → generating)
6. Play the result and download

## Known MVP limits (say upfront if asked)

- Jobs live in memory — lost on server restart
- Video length is capped (~5–10s) to match Wan i2v
- No face-detection gate yet — bad photos fail downstream with a friendly message

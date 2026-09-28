# Memorial AI

AI-powered farewell video generation for meaningful goodbyes.

## Project Progress Vlog

[![Progress Vlog](https://img.youtube.com/vi/E6X8fCzyvXE/0.jpg)](https://youtu.be/E6X8fCzyvXE)
[![Progress Vlog](https://img.youtube.com/vi/x-LieV4uc4E/0.jpg)](https://youtu.be/x-LieV4uc4E)
[![Progress Vlog](https://img.youtube.com/vi/G6xwk8PF0E4/0.jpg)](https://youtu.be/G6xwk8PF0E4)

Follow along with development updates on YouTube.

## What is Memorial AI?

Memorial AI creates hyper-personalized farewell videos of the deceased, enabling families to see and hear their loved ones deliver a final message during funeral services or in private. Using just a single photo, a short voice sample, and farewell text, the system generates a realistic talking-head video — offering emotional closure in a way no traditional service can.

## How It Works

1. **Upload** a photo of the deceased and a short voice sample
2. **Write** a farewell message (or choose from guided templates)
3. **Generate** — the AI clones the voice, animates the photo, and produces a video
4. **Share** the farewell video at a service or with family

## Tech Stack

- **Frontend:** React 18 + Vite + TailwindCSS
- **Backend:** Node.js + Express + BullMQ (job queue), orchestrating the AI services over HTTP
- **AI Pipeline:** Two standalone FastAPI microservices — [`tts-service`](./tts-service/README.md) and [`video-service`](./video-service/README.md)
- **Voice Cloning:** Aliyun DashScope Qwen3-TTS voice cloning (`qwen-voice-enrollment` + `qwen3-tts-vc`) — clones a voice from a reference sample; see [`tts-service/`](./tts-service/README.md)
- **Video Generation:** Aliyun DashScope Wan2.7 i2v (image+audio → talking head) — see [`video-service/`](./video-service/README.md)
- **Lip Sync:** Built into Wan2.7 i2v — audio-driven, no separate lip-sync model
- **Realtime:** Socket.IO for progress updates

## Project Milestones

| Milestone | Description                                                     | Timeline   |
| --------- | --------------------------------------------------------------- | ---------- |
| MVP 1     | Generate farewell videos with the deceased speaking their wills | Months 1–3 |
| MVP 2     | Interactive digital avatar with Q&A capabilities                | Months 4–5 |

## Getting Started

> **Prerequisites:** Node.js 20+, Python 3.12+, [`uv`](https://docs.astral.sh/uv/), and Docker. Both AI services call Aliyun DashScope, so each needs a `DASHSCOPE_API_KEY`; `video-service` additionally needs an S3 bucket. No GPU is required.

The app is made of **four processes**: the client + Express server (started together by `npm run dev`), plus the `tts-service` and `video-service` FastAPI apps (each started on its own). All four must be running for end-to-end generation.

### 1. Install tooling

```bash
# uv (Python package/venv manager for the two AI services)
curl -LsSf https://astral.sh/uv/install.sh | sh
# then add uv to your PATH for the current shell (or restart your terminal)
source "$HOME/.local/bin/env"

# verify
node -v   # v20+
uv --version
```

### 2. Get the code and install deps

```bash
git clone https://github.com/your-username/memorial-ai.git
cd memorial-ai

# Install all workspace deps (client + server)
npm install
```

### 3. Configure environment

Each of the three env files has a matching `.env.example`. Copy all three and fill in the values.

```bash
cp .env.example .env                              # client + Express server
cp tts-service/.env.example tts-service/.env      # DASHSCOPE_API_KEY
cp video-service/.env.example video-service/.env  # DASHSCOPE_API_KEY + S3 bucket creds
```

### 4. Start everything

The quickest way is the deploy script, which starts all four processes (plus Redis), waits for their health checks, and reclaims ports still held by an earlier run:

```bash
./service_deploy.sh start     # start everything
./service_deploy.sh status    # per-service health table
./service_deploy.sh logs tts  # tail one service (or omit the name for all)
./service_deploy.sh stop
./service_deploy.sh restart
```

Services run in the background and survive closing the terminal. Logs and pidfiles land in `logs/`.

<details>
<summary>Or start each process manually</summary>

Run each command in its **own terminal** and keep them running.

```bash
# Terminal 1 — Redis (used by BullMQ)
docker compose up -d redis

# Terminal 2 — React client + Express server
npm run dev

# Terminal 3 — TTS service (DashScope Qwen3-TTS voice cloning)
cd tts-service && uv sync && uv run uvicorn app.main:app --host 127.0.0.1 --port 8200

# Terminal 4 — Video service (DashScope Wan2.7 i2v)
cd video-service && uv sync && uv run uvicorn app.main:app --host 127.0.0.1 --port 8300
```

</details>

Services and their URLs:

| Process                   | URL                     | Notes                                                               |
| ------------------------- | ----------------------- | ------------------------------------------------------------------- |
| React client              | <http://localhost:5173> | Falls back to `5174+` if the port is in use                         |
| Express server            | <http://localhost:3001> | Aggregated health at `/api/health`                                  |
| `tts-service` (FastAPI)   | <http://localhost:8200> | Health at `/health`; see [README](./tts-service/README.md)          |
| `video-service` (FastAPI) | <http://localhost:8300> | Health at `/api/v1/health`; see [README](./video-service/README.md) |

### 5. Verify

```bash
# Should report status "ok" with both downstream services "ok"
curl http://localhost:3001/api/health
```

If `tts` or `video` shows `down`, that service isn't running (or its `.env`/`DASHSCOPE_API_KEY` is missing) — the pipeline will fail at the clone/submit step with a `fetch failed` (504) error until both are up.

Sample inputs (portrait, voice clip + transcript, and a farewell message) are provided in [`data/`](./data) for testing the `/create` form.

> **Keep the farewell short.** The cloned speech drives the video, so the message must fit inside `VIDEO_DURATION_MAX` (10s by default, 15s max) — roughly 30 words. Longer text is cut off at the end of the video, and Wan i2v rejects driving audio over 30s outright.

## Git Workflow

- `main` — release / stable
- `dev-<phase>-<topic>` — short-lived branches off `main` (e.g. `dev-phase1-video-generation`)

## Testing

```bash
# Unit checks + API validation (start the Express server for API checks)
npm run test:e2e

# Optional full generation against DashScope (uses credits)
E2E_LIVE=1 npm run test:e2e
```

Demo checklist: [docs/DEMO.md](./docs/DEMO.md). Full plan: [DEVELOPMENT.md](./DEVELOPMENT.md).

## License

TBD

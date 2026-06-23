# Memorial AI

AI-powered farewell video generation for meaningful goodbyes.

## Project Progress Vlog

[![Progress Vlog](https://img.youtube.com/vi/E6X8fCzyvXE/0.jpg)](https://youtu.be/E6X8fCzyvXE)
[![Progress Vlog](https://img.youtube.com/vi/x-LieV4uc4E/0.jpg)](https://youtu.be/x-LieV4uc4E)

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
- **Voice Cloning:** Qwen3-TTS (`Qwen3-TTS-12Hz-1.7B-Base`) — zero-shot cloning from reference audio; see [`tts-service/`](./tts-service/README.md)
- **Video Generation:** Aliyun DashScope Wan2.7 i2v (image+audio → talking head) — see [`video-service/`](./video-service/README.md)
- **Lip Sync:** Built into Wan2.7 i2v — audio-driven, no separate lip-sync model
- **Realtime:** Socket.IO for progress updates

## Project Milestones

| Milestone | Description                                                     | Timeline   |
| --------- | --------------------------------------------------------------- | ---------- |
| MVP 1     | Generate farewell videos with the deceased speaking their wills | Months 1–3 |
| MVP 2     | Interactive digital avatar with Q&A capabilities                | Months 4–5 |

## Getting Started

> **Prerequisites:** Node.js 20+, Python 3.12+ with [`uv`](https://docs.astral.sh/uv/), Docker. The `video-service` also needs an Aliyun DashScope API key and an S3 bucket; `tts-service` runs the TTS model locally (Apple Silicon / GPU recommended).

```bash
# Clone the repo
git clone https://github.com/your-username/memorial-ai.git
cd memorial-ai

# Install all workspace deps (client + server)
npm install

# Copy env defaults
cp .env.example .env

# Start Redis (used by BullMQ from Phase 2 onwards)
docker compose up -d redis

# Run client + server together
npm run dev
```

This starts:

- React client → <http://localhost:5173>
- Express server → <http://localhost:3001> (health: `/api/health`)

The AI pipeline runs as two standalone FastAPI services that start separately from the client/server. See each service's README for setup:

- **`tts-service`** (Qwen3-TTS voice cloning) → <http://localhost:8200> — see [`tts-service/README.md`](./tts-service/README.md)
- **`video-service`** (DashScope Wan2.7 i2v) → <http://localhost:8300> — see [`video-service/README.md`](./video-service/README.md)

```bash
# In separate terminals
cd tts-service   && uv sync && uv run uvicorn app.main:app --port 8200
cd video-service && uv sync && uv run uvicorn app.main:app --port 8300
```

## Git Workflow

- `main` — release / stable
- `dev-<phase>-<topic>` — short-lived branches off `main` (e.g. `dev-phase1-video-generation`)

See [DEVELOPMENT.md](./DEVELOPMENT.md) for the full development plan, architecture details, and phase breakdown.

## License

TBD

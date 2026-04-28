# Memorial AI

AI-powered farewell video generation for meaningful goodbyes.

## What is Memorial AI?

Memorial AI creates hyper-personalized farewell videos of the deceased, enabling families to see and hear their loved ones deliver a final message during funeral services or in private. Using just a single photo, a short voice sample, and farewell text, the system generates a realistic talking-head video — offering emotional closure in a way no traditional service can.

## How It Works

1. **Upload** a photo of the deceased and a short voice sample
2. **Write** a farewell message (or choose from guided templates)
3. **Generate** — the AI clones the voice, animates the photo, and produces a video
4. **Share** the farewell video at a service or with family

## Tech Stack

- **Frontend:** React 18 + Vite + TailwindCSS
- **Backend:** Node.js + Express + BullMQ (job queue)
- **AI Pipeline:** ComfyUI (orchestration)
- **Voice Cloning:** Qwen TTS (CosyVoice)
- **Video Generation:** Seedance 2.0 API → Wan 2.2 (self-hosted)
- **Lip Sync:** SadTalker / MuseTalk
- **Realtime:** Socket.IO for progress updates

## Project Milestones

| Milestone | Description                                                     | Timeline   |
| --------- | --------------------------------------------------------------- | ---------- |
| MVP 1     | Generate farewell videos with the deceased speaking their wills | Months 1–3 |
| MVP 2     | Interactive digital avatar with Q&A capabilities                | Months 4–5 |

## Getting Started

> **Prerequisites:** Node.js 20+, Python 3.10+, a local GPU (NVIDIA or Apple Silicon), Docker

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

ComfyUI runs separately on the host (it needs direct GPU access). See [`comfyui/README.md`](./comfyui/README.md) for install instructions; once running it's expected at <http://localhost:8188>.

## Git Workflow

- `main` — release / stable
- `dev` — integration branch
- `feature/*` — short-lived branches off `dev`

See [DEVELOPMENT.md](./DEVELOPMENT.md) for the full development plan, architecture details, and phase breakdown.

## License

TBD

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

| Milestone | Description | Timeline |
|---|---|---|
| MVP 1 | Generate farewell videos with the deceased speaking their wills | Months 1–3 |
| MVP 2 | Interactive digital avatar with Q&A capabilities | Months 4–5 |

## Getting Started

> **Prerequisites:** Node.js 20+, Python 3.10+, a local GPU (NVIDIA recommended), Docker

```bash
# Clone the repo
git clone https://github.com/your-username/memorial-ai.git
cd memorial-ai

# Start services (ComfyUI + Redis)
docker compose up -d

# Install and run the backend
cd server && npm install && npm run dev

# Install and run the frontend
cd client && npm install && npm run dev
```

See [DEVELOPMENT.md](./DEVELOPMENT.md) for the full development plan, architecture details, and phase breakdown.

## License

TBD

# Memorial AI — Development Plan

## Project Summary

Memorial AI generates hyper-personalized farewell videos of the deceased using a single photo, a voice sample, and farewell text. The system clones the voice (Aliyun DashScope **Qwen3-TTS voice cloning**) and generates a realistic, audio-driven talking-head video (Aliyun DashScope **Wan2.6 i2v**), delivering the result through a web application.

The AI pipeline runs as two standalone **FastAPI microservices** — [`tts-service`](./tts-service/README.md) and [`video-service`](./video-service/README.md) — which the Express backend orchestrates over HTTP. The React + Vite frontend drives the user experience.

> **Architecture note:** earlier drafts of this plan routed the pipeline through **ComfyUI** and used the **Seedance 2.0** API for video. Both have been dropped. ComfyUI is replaced by the two FastAPI services above, and video generation is now Aliyun DashScope Wan2.6 i2v. Because Wan2.6 i2v is audio-driven, lip-sync is handled inside the video model — there is no separate SadTalker/MuseTalk/Wav2Lip step.

> **Voice-cloning note:** `tts-service` originally ran `Qwen3-TTS-12Hz-1.7B-Base` locally on Apple Silicon. It now calls DashScope's hosted Qwen3-TTS voice cloning instead, so no service needs a GPU and both AI services share one API key. This is a trial swap — the `POST /clone` contract is unchanged, so the backend pipeline is unaffected and the local runner can be restored from git history if the hosted quality or cost does not hold up.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENT (React + Vite)                       │
│  Upload UI  →  Progress Tracker  →  Video Player / Download        │
└──────────────────────┬─────────────────────────────────────────────┘
                       │ REST / WebSocket
┌──────────────────────▼─────────────────────────────────────────────┐
│                     BACKEND (Express + Node.js)                     │
│  File Upload · Redis Job Store · Quotas · Service Clients · API     │
└──────┬──────────────────────────────────────┬──────────────────────┘
       │ HTTP                                  │ HTTP
┌──────▼─────────────────────┐   ┌────────────▼─────────────────────────┐
│  tts-service  (:8200)      │   │  video-service  (:8300)               │
│  FastAPI · DashScope       │   │  FastAPI                              │
│  Qwen3-TTS (cloud)         │   │  Aliyun DashScope Wan2.6 i2v (cloud)  │
│  voice sample → cloned WAV │   │  image + audio → talking-head video   │
└────────────────────────────┘   │  hosts inputs/outputs on S3,          │
                                  │  submits + polls async DashScope task │
                                  └────────────────┬──────────────────────┘
                                                   │
                                          ┌────────▼─────────┐
                                          │   Storage (S3)    │
                                          │  inputs + outputs │
                                          └───────────────────┘
```

---

## Tech Stack

| Layer            | Technology                                                                       | Purpose                                                             |
| ---------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Frontend         | React 18 + Vite + TailwindCSS                                                    | SPA with upload wizard, progress tracking, video preview            |
| Backend          | Node.js + Express + Socket.IO                                                    | REST API, Redis-backed job store + quotas, AI-service orchestration |
| AI Pipeline      | FastAPI microservices (`tts-service`, `video-service`)                           | Standalone Python services the backend calls over HTTP              |
| Voice Cloning    | Aliyun DashScope Qwen3-TTS (`qwen-voice-enrollment` + `qwen3-tts-vc`)            | Cloud voice cloning from a short reference sample                   |
| Video Generation | Aliyun DashScope **Wan2.6 i2v** (`wan2.6-i2v-flash`) → self-hosted Wan (Phase 5) | Audio-driven image-to-video talking-head generation                 |
| Lip Sync         | Built into Wan2.6 i2v (audio-driven)                                             | No separate model; the driving audio animates the mouth             |
| Job state        | Redis (`ioredis`)                                                                | Job records with TTL, restart recovery, quota windows               |
| Storage          | AWS S3 — private objects behind presigned URLs (R2-ready)                        | Uploaded inputs + archived outputs                                  |
| Realtime         | Socket.IO                                                                        | Progress updates from backend to frontend                           |

---

## Phase Breakdown

### Phase 0 — Project Scaffolding & Environment (Week 1) ✅ Done

| Task                | Details                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Monorepo setup      | `/client` (React+Vite), `/server` (Express), `/tts-service` + `/video-service` (FastAPI)  |
| Dev environment     | `uv` per Python service; Docker Compose for Redis; DashScope API key for both AI services |
| Service scaffolding | FastAPI apps for voice cloning and video generation                                       |
| CI basics           | ESLint, Prettier, Husky pre-commit hooks; `ruff` for the Python services                  |
| Git workflow        | `main` → `dev-<phase>-<topic>` branches                                                   |

**Deliverable:** Running dev environment with `tts-service` at `localhost:8200`, `video-service` at `localhost:8300`, Express at `localhost:3001`, React at `localhost:5173`.

---

### Phase 1 — Core AI Pipeline (Weeks 2–4) ★ Critical Path ✅ Done

The hardest part: get the AI pipeline working end-to-end before building any UI. Delivered as two standalone FastAPI services rather than a ComfyUI graph.

**Step 1: Voice Cloning Service — `tts-service` (Week 2)** ✅

- Standalone FastAPI service for voice cloning on `:8200`. First built around a local **Qwen3-TTS** checkpoint (Apple Silicon MPS, `float16`), then reimplemented against **DashScope Qwen3-TTS voice cloning** — enroll a voice from the reference sample, synthesize with it, return the audio
- `POST /clone` (multipart): `ref_audio` + `ref_text` + `text` + `language` → `audio/wav`
- `scripts/test_quality.py` slices a reference into 5s/15s/30s clips to find the minimum sample length for acceptable quality
- Output: WAV file with the cloned voice speaking the farewell text

**Step 2: Video Generation Service — `video-service` (Week 3)** ✅

- Standalone FastAPI service on `:8300` calling Aliyun **DashScope Wan2.6 i2v** (`image` + optional driving `audio` + `prompt` → talking-head video)
- Job API: `POST /api/v1/jobs` → `job_id`; `GET /api/v1/jobs/{id}` for status + final `video_url`
- DashScope needs public media URLs and runs asynchronously, so the service uploads inputs to **S3**, submits the async task, polls until `SUCCEEDED`/`FAILED`, then re-archives the result to S3 for a stable URL
- Handles content-type/size validation, poll timeout/interval, and DashScope errors
- Output: A talking-head video of the person from the photo

**Step 3: Lip Sync + Compositing (Week 4)** ✅ — folded into `video-service`

- Wan2.6 i2v is **audio-driven**: passing the cloned speech as the driving `audio` animates the mouth, so no separate SadTalker/MuseTalk/Wav2Lip lip-sync step is needed
- Post-processing (fades, optional background music) is deferred to the backend/frontend phases

**End-to-end pipeline (orchestrated by the Express backend):**

```
[Input Image] ──────────────────────────────────────────────┐
                                                             ▼
[Voice Sample + Text] ─→ [tts-service: Qwen3-TTS] ─→ [Cloned Audio] ─→ [video-service: DashScope Wan2.6 i2v] ─→ [Talking-Head Video]
```

**Deliverable:** Two independently runnable FastAPI services that, given a photo + voice sample + text, produce a cloned-voice talking-head farewell video. ✅

---

### Phase 2 — Backend API & Job System (Weeks 5–6) ✅ Done

Kept deliberately minimal for the MVP: a single job-creation endpoint, an **in-process** async pipeline, and a fixed video prompt. Job state moved from memory to **Redis** after the MVP (see Phase 4.5) — jobs now survive a backend restart.

**Step 1: Express API (Week 5)** ✅

| Endpoint        | Method | Description                                                                                                 |
| --------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| `/api/jobs`     | POST   | Multipart (`image`, `audio`, `refText`, `text`, `language?`) → `202 { jobId, status }`; starts the pipeline |
| `/api/jobs/:id` | GET    | Job status + result `videoUrl` (the video-service S3 URL) when completed                                    |

- File upload with Multer (`memoryStorage`); validates `image/*` + `audio/*` content types and enforces `MAX_UPLOAD_MB`
- In-process async pipeline (fire-and-forget after `202`); `JobStore` persists each job to Redis with a TTL and recovers unfinished jobs on boot
- Job status tracking: `queued → voice_cloning → video_generating → completed / failed`
- The result video is served directly from the video-service S3 `videoUrl`, so no separate stream/download endpoint is needed for the MVP

**Step 2: Service Orchestration (Week 6)** ✅

- Service clients in Node.js — `TtsClient` (`server/src/services/tts.ts`) and `VideoClient` (`server/src/services/video.ts`) for the `video-service` job API
- Pipeline (`server/src/jobs/pipeline.ts`): clone the voice via `tts-service`, submit the photo + cloned audio + a fixed prompt to `video-service`, then poll its job until the `videoUrl` is ready
- `video-service` job `detail`/stage is bridged into the backend job record as progress
- Errors at any stage mark the job `failed` with the message
- Socket.IO pushes every job update to a per-job room (`job:subscribe` → `job:update`)

**Deliverable:** Backend API that accepts uploads, runs the two FastAPI services end-to-end in process, and exposes job status + the result video URL. ✅

---

### Phase 3 — Frontend Web Application (Weeks 7–8) ✅ Done (core UI)

Kept minimal: a single-page create form (not a multi-step wizard) and file upload only (no in-browser recording). Routing via `react-router-dom`, styling via the existing Tailwind `memorial` palette, live progress via Socket.IO.

**Step 1: Core UI (Week 7)** ✅

Routes / pages (`client/src/pages/`):

1. **Landing** (`/`) — hero + "Begin" CTA
2. **Create** (`/create`) — single form: photo, voice sample (file), transcript of the sample (`refText`), farewell message, language; `POST /api/jobs` → navigates to the job page
3. **Job** (`/jobs/:id`) — subscribes to Socket.IO (`job:subscribe` → `job:update`) for live status (`queued → voice_cloning → video_generating`); on `completed` shows a native video player + download link; on `failed` shows the error with a retry link

Supporting code: `services/api.ts` (typed `createJob`/`getJob`), `services/socket.ts` (shared connection), `hooks/useJob.ts` (load + live updates), `components/Page.tsx` (shared shell).

**Step 2: Polish & UX (Week 8)** — partially done; rest deferred as non-essential

- ✅ Dark/muted palette (existing Tailwind `memorial` theme)
- ✅ Error / loading states, retry UX, submit validation (required fields)
- ⏳ Deferred (not needed for the MVP): responsive/mobile tuning, in-browser voice recording + waveform, farewell-text templates, face-detection / audio-length validation

**Deliverable:** Working web app where a user can submit inputs and watch the job progress to a playable farewell video. ✅ (End-to-end generation requires `tts-service` + `video-service` running.)

---

### Phase 4 — Integration Testing & MVP Polish (Weeks 9–10) ✅ Done (MVP scope)

| Task               | Details                                                                                                                              | Status |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| End-to-end testing | `npm run test:e2e` — unit checks + API validation; `E2E_LIVE=1` runs full upload → poll → `videoUrl`                                 | ✅     |
| Edge cases         | Max farewell/ref-text length; client audio duration probe (3–60s); face-related DashScope failures mapped to a friendly photo hint   | ✅     |
| Performance        | Video duration derived from cloned audio (clamped 5–10s); TTS enrollment cache already in place; result-video content cache deferred | ✅     |
| Quality tuning     | Express forwards `VIDEO_RESOLUTION` / duration / prompt_extend / watermark; talking-head prompt tightened for lip sync               | ✅     |
| Demo preparation   | Checklist + script in [`docs/DEMO.md`](./docs/DEMO.md) (recording left to the presenter)                                             | ✅     |
| Error recovery     | Fetch timeouts + one downstream retry; aggregated `/api/health`; REST poll fallback; `JOB_EXPIRED` once the 7-day Redis TTL passes   | ✅     |

**Deferred (post-MVP):** ML face detection, output video caching, Playwright UI suite, Turnstile abuse protection.

**Deliverable: Milestone 1 MVP** — Web application that generates farewell videos with the deceased speaking their wills. ✅

---

### Phase 4.5 — Production Deployment (post-MVP) ✅ Done

Hardening and deployment of the MVP at zero Cloudflare cost. Full runbook: [DEPLOYMENT.md](./DEPLOYMENT.md).

| Area              | Details                                                                                                                                                                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Containers        | Multi-stage Dockerfiles for all three services (`node:20-alpine`, `uv sync --frozen`); `docker-compose-prod.yml` keeps tts/video/Redis on a `private` network and only server + cloudflared on `edge`, so the DashScope key is never reachable from the internet |
| Job persistence   | Redis job records with a 7-day TTL; on boot, jobs that had reached video generation resume polling, earlier stages fail with a friendly message                                                                                                                  |
| Spend protection  | `JobQuota` fixed windows — per-user per-hour/day plus a global daily cap; 429 with `Retry-After`; quota is consumed at creation, so failures can't be retried for free                                                                                           |
| Cloudflare Access | Origin-side JWT verification (`Cf-Access-Jwt-Assertion` / `CF_Authorization` cookie) against the team JWKS via `jose`; `CF_ACCESS_REQUIRED=true` refuses to boot without team/aud; per-user quotas key off the verified email                                    |
| CORS lockdown     | `CORS_ORIGINS` allowlist for Express and Socket.IO, with credentials for the cross-origin Access cookie                                                                                                                                                          |
| Private S3        | Bucket objects stay private; SigV4 presigned GETs for inputs (1 h) and outputs (7 d, matched to `JOB_TTL_SECONDS`); `S3_ENDPOINT_URL` makes Cloudflare R2 a config-only switch                                                                                   |
| Client origin     | `VITE_API_BASE` / `VITE_SOCKET_URL` build-time vars point the SPA at the tunnel; empty = same-origin via the Vite dev proxy                                                                                                                                      |
| Topology          | SPA on Cloudflare Pages (`memorial-ai.zackee.dev`), API behind a Cloudflare Tunnel (`memorial-api.zackee.dev`) to a home server (currently a MacBook)                                                                                                            |

**Deliverable:** Live end-to-end deployment; first production generation verified (3 min 17 s). ✅

---

### Phase 5 — Digital Avatar & Interaction (Weeks 11–14) — Milestone 2

| Task                  | Details                                                                              |
| --------------------- | ------------------------------------------------------------------------------------ |
| LLM integration       | Integrate an LLM (e.g., Qwen, LLaMA) with persona prompting based on deceased's info |
| Streaming TTS         | Real-time voice cloning for conversational responses                                 |
| Avatar rendering      | Live avatar using a self-hosted Wan model or a real-time avatar framework            |
| Chat interface        | Text/voice input from family → AI avatar responds in character                       |
| Session management    | Store conversation context, allow multi-turn Q&A                                     |
| Self-hosted migration | Move video generation from cloud DashScope Wan2.6 i2v to a self-hosted Wan model     |

**Deliverable: Milestone 2 MVP** — Web application with interactive digital avatar for Q&A-style farewells.

---

## Directory Structure

```
memorial-ai/
├── client/                     # React + Vite frontend
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   ├── pages/              # Landing, Upload, Processing, Result
│   │   ├── hooks/              # Custom hooks (useSocket, useUpload)
│   │   ├── services/           # API client functions
│   │   ├── assets/             # Images, icons
│   │   └── App.tsx
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── server/                     # Express backend
│   ├── src/
│   │   ├── routes/             # API route handlers (health, jobs)
│   │   ├── services/           # tts/video service clients
│   │   ├── jobs/               # Redis job store + quotas + pipeline orchestrator
│   │   ├── middleware/         # Upload (Multer), validation, Cloudflare Access JWT
│   │   ├── config/             # Environment config
│   │   └── index.ts
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── tts-service/                # FastAPI · DashScope Qwen3-TTS voice cloning (:8200)
│   ├── app/                    # main, routes, dashscope, voices, audio, config
│   ├── scripts/                # DashScope probe + quality-threshold test
│   ├── Dockerfile
│   ├── pyproject.toml          # uv-managed deps
│   └── uv.lock
├── video-service/              # FastAPI · DashScope Wan2.6 i2v (:8300)
│   ├── app/                    # main, routes, dashscope, storage, jobs, schemas
│   ├── scripts/                # standalone DashScope probe
│   ├── Dockerfile
│   ├── pyproject.toml          # uv-managed deps
│   └── uv.lock
├── docker-compose.yml          # Redis (+ backend)
├── docker-compose-prod.yml     # production stack (home server)
├── .dockerignore
├── .env.example
├── .gitignore
├── DEPLOYMENT.md               # production runbook
└── README.md
```

---

## Risk Register

| Risk                                      | Impact | Mitigation                                                                                                                                                                                           |
| ----------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DashScope Wan2.6 i2v quality/latency/cost | High   | Tested in Phase 1; tune resolution/duration; self-hosted Wan as Phase 5 fallback                                                                                                                     |
| Cloud dependency (DashScope, S3)          | High   | Both AI services now depend on DashScope; requires public S3 for video inputs + outbound DashScope access; expiring result URLs mitigated by re-archiving (video) and returning bytes inline (audio) |
| DashScope voice quota / cloning cost      | Medium | Enrollments are cached per reference sample and deleted on shutdown; revert to the local Qwen3-TTS runner if limits bite                                                                             |
| Voice cloning quality with short samples  | High   | Require minimum 15s sample; offer recording guidance                                                                                                                                                 |
| Lip sync artifacts ("uncanny valley")     | Medium | Audio-driven Wan2.6 i2v handles lip sync; tune prompt/duration if artifacts appear                                                                                                                   |
| GPU requirements for local demo           | Low    | Both voice cloning and video generation run in the cloud (DashScope); nothing needs a local GPU                                                                                                      |
| Ethical concerns / deepfake misuse        | High   | Require consent verification; add watermarks; terms of service                                                                                                                                       |
| Solo developer bandwidth                  | Medium | Prioritize ruthlessly; cut Milestone 2 scope if needed                                                                                                                                               |

---

## Timeline Summary

| Week     | Phase       | Key Deliverable                                                           | Status     |
| -------- | ----------- | ------------------------------------------------------------------------- | ---------- |
| 1        | Scaffolding | Dev environment running                                                   | ✅ Done    |
| 2–4      | AI Pipeline | `tts-service` + `video-service` produce a farewell video                  | ✅ Done    |
| 5–6      | Backend     | Express API + in-process job pipeline + service orchestration             | ✅ Done    |
| 7–8      | Frontend    | Create form + live progress + video result UI                             | ✅ Done    |
| 9–10     | Polish      | **Milestone 1 MVP complete**                                              | ✅ Done    |
| post-MVP | Deployment  | Containerized stack, Redis persistence, quotas, Cloudflare Pages + Tunnel | ✅ Done    |
| 11–14    | Avatar      | **Milestone 2 MVP complete**                                              | ⏳ Pending |

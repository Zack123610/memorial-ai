# Memorial AI — Development Plan

## Project Summary

Memorial AI generates hyper-personalized farewell videos of the deceased using a single photo, a voice sample, and farewell text. The system clones the voice (Qwen3-TTS) and generates a realistic, audio-driven talking-head video (Aliyun DashScope **Wan2.7 i2v**), delivering the result through a web application.

The AI pipeline runs as two standalone **FastAPI microservices** — [`tts-service`](./tts-service/README.md) and [`video-service`](./video-service/README.md) — which the Express backend orchestrates over HTTP. The React + Vite frontend drives the user experience.

> **Architecture note:** earlier drafts of this plan routed the pipeline through **ComfyUI** and used the **Seedance 2.0** API for video. Both have been dropped. ComfyUI is replaced by the two FastAPI services above, and video generation is now Aliyun DashScope Wan2.7 i2v. Because Wan2.7 i2v is audio-driven, lip-sync is handled inside the video model — there is no separate SadTalker/MuseTalk/Wav2Lip step.

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
│  Auth · File Upload · Job Queue (BullMQ) · Service Clients · API    │
└──────┬──────────────────────────────────────┬──────────────────────┘
       │ HTTP                                  │ HTTP
┌──────▼─────────────────────┐   ┌────────────▼─────────────────────────┐
│  tts-service  (:8200)      │   │  video-service  (:8300)               │
│  FastAPI · Qwen3-TTS       │   │  FastAPI                              │
│  (local, Apple Silicon)    │   │  Aliyun DashScope Wan2.7 i2v (cloud)  │
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

| Layer            | Technology                                                          | Purpose                                                      |
| ---------------- | ------------------------------------------------------------------- | ------------------------------------------------------------ |
| Frontend         | React 18 + Vite + TailwindCSS                                       | SPA with upload wizard, progress tracking, video preview     |
| Backend          | Node.js + Express + BullMQ                                          | REST API, job queue, file handling, AI-service orchestration |
| AI Pipeline      | FastAPI microservices (`tts-service`, `video-service`)              | Standalone Python services the backend calls over HTTP       |
| Voice Cloning    | Qwen3-TTS (`Qwen3-TTS-12Hz-1.7B-CustomVoice`)                       | Zero-shot voice cloning from a short reference sample        |
| Video Generation | Aliyun DashScope **Wan2.7 i2v** (cloud) → self-hosted Wan (Phase 5) | Audio-driven image-to-video talking-head generation          |
| Lip Sync         | Built into Wan2.7 i2v (audio-driven)                                | No separate model; the driving audio animates the mouth      |
| Database         | SQLite (MVP) → PostgreSQL (prod)                                    | Job metadata, user sessions                                  |
| Storage          | Local filesystem (MVP) → S3 (prod)                                  | Uploaded assets + generated videos                           |
| Realtime         | Socket.IO                                                           | Progress updates from backend to frontend                    |

---

## Phase Breakdown

### Phase 0 — Project Scaffolding & Environment (Week 1) ✅ Done

| Task                | Details                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------- |
| Monorepo setup      | `/client` (React+Vite), `/server` (Express), `/tts-service` + `/video-service` (FastAPI) |
| Dev environment     | `uv` per Python service; Docker Compose for Redis; local GPU (Apple Silicon MPS) for TTS |
| Service scaffolding | FastAPI apps for voice cloning and video generation                                      |
| CI basics           | ESLint, Prettier, Husky pre-commit hooks; `ruff` for the Python services                 |
| Git workflow        | `main` → `dev-<phase>-<topic>` branches                                                  |

**Deliverable:** Running dev environment with `tts-service` at `localhost:8200`, `video-service` at `localhost:8300`, Express at `localhost:3001`, React at `localhost:5173`.

---

### Phase 1 — Core AI Pipeline (Weeks 2–4) ★ Critical Path ✅ Done

The hardest part: get the AI pipeline working end-to-end before building any UI. Delivered as two standalone FastAPI services rather than a ComfyUI graph.

**Step 1: Voice Cloning Service — `tts-service` (Week 2)** ✅

- Standalone FastAPI service wrapping **Qwen3-TTS** (`Qwen3-TTS-12Hz-1.7B-CustomVoice`) for zero-shot voice cloning; runs on `:8200` (Apple Silicon MPS, `float16`)
- `POST /clone` (multipart): `ref_audio` + `ref_text` + `text` + `language` → `audio/wav`
- `scripts/test_quality.py` slices a reference into 5s/15s/30s clips to find the minimum sample length for acceptable quality
- Output: WAV file with the cloned voice speaking the farewell text

**Step 2: Video Generation Service — `video-service` (Week 3)** ✅

- Standalone FastAPI service on `:8300` calling Aliyun **DashScope Wan2.7 i2v** (`image` + optional driving `audio` + `prompt` → talking-head video)
- Job API: `POST /api/v1/jobs` → `job_id`; `GET /api/v1/jobs/{id}` for status + final `video_url`
- DashScope needs public media URLs and runs asynchronously, so the service uploads inputs to **S3**, submits the async task, polls until `SUCCEEDED`/`FAILED`, then re-archives the result to S3 for a stable URL
- Handles content-type/size validation, poll timeout/interval, and DashScope errors
- Output: A talking-head video of the person from the photo

**Step 3: Lip Sync + Compositing (Week 4)** ✅ — folded into `video-service`

- Wan2.7 i2v is **audio-driven**: passing the cloned speech as the driving `audio` animates the mouth, so no separate SadTalker/MuseTalk/Wav2Lip lip-sync step is needed
- Post-processing (fades, optional background music) is deferred to the backend/frontend phases

**End-to-end pipeline (orchestrated by the Express backend):**

```
[Input Image] ──────────────────────────────────────────────┐
                                                             ▼
[Voice Sample + Text] ─→ [tts-service: Qwen3-TTS] ─→ [Cloned Audio] ─→ [video-service: DashScope Wan2.7 i2v] ─→ [Talking-Head Video]
```

**Deliverable:** Two independently runnable FastAPI services that, given a photo + voice sample + text, produce a cloned-voice talking-head farewell video. ✅

---

### Phase 2 — Backend API & Job System (Weeks 5–6)

**Step 1: Express API (Week 5)**

| Endpoint              | Method | Description                                 |
| --------------------- | ------ | ------------------------------------------- |
| `/api/upload`         | POST   | Multipart upload: image, voice sample, text |
| `/api/jobs`           | POST   | Create a new video generation job           |
| `/api/jobs/:id`       | GET    | Get job status + result URL                 |
| `/api/jobs/:id/video` | GET    | Stream/download the generated video         |

- File upload with Multer (validate image formats, audio formats, file size limits)
- BullMQ job queue backed by Redis for async processing
- Worker process that calls `tts-service` then `video-service` to run the pipeline
- Job status tracking: `queued → processing → voice_cloning → video_generating → completed / failed`

**Step 2: Service Orchestration (Week 6)**

- Service clients in Node.js — `TtsClient` (already implemented in `server/src/services/tts.ts`) and a new `VideoClient` for the `video-service` job API
- Pipeline worker: clone the voice via `tts-service`, then submit the photo + cloned audio + prompt to `video-service` and poll its job until the `video_url` is ready
- Bridge `video-service` job status (`detail`/stage) into the backend job record
- Error handling and retry logic across both service calls
- Socket.IO events to push progress updates to the frontend

**Deliverable:** Backend API that accepts uploads, queues jobs, orchestrates the two FastAPI services, and returns video results.

---

### Phase 3 — Frontend Web Application (Weeks 7–8) ◀ Current focus

**Step 1: Core UI (Week 7)**

Pages:

1. **Landing Page** — Hero section explaining the service, CTA to start
2. **Upload Wizard** (multi-step form):
   - Step 1: Upload photo of the deceased
   - Step 2: Upload voice sample (or record in-browser via MediaRecorder API)
   - Step 3: Enter farewell text (with templates/prompts to help)
   - Step 4: Preview inputs & confirm
3. **Processing Page** — Real-time progress bar with status updates via Socket.IO
4. **Result Page** — Video player (video.js or native), download button, share options

**Step 2: Polish & UX (Week 8)**

- Responsive design (mobile-first — families may use phones)
- Dark/muted color palette (appropriate for the subject matter)
- In-browser voice recording with waveform visualization
- Text templates: "heartfelt farewell", "family message", "visual will"
- Error states, loading states, retry UX
- Input validation (image face detection check, audio length check)

**Deliverable:** Fully functional web app where a user can upload inputs and receive a generated farewell video.

---

### Phase 4 — Integration Testing & MVP Polish (Weeks 9–10)

| Task               | Details                                                                               |
| ------------------ | ------------------------------------------------------------------------------------- |
| End-to-end testing | Full flow: upload → queue → generate → download                                       |
| Edge cases         | No face detected, poor audio quality, very long text                                  |
| Performance        | Optimize video generation time, add caching                                           |
| Quality tuning     | Adjust TTS parameters, video resolution, lip sync accuracy                            |
| Demo preparation   | Record demo video, prepare presentation materials                                     |
| Error recovery     | Handle service crashes, DashScope/API timeouts, and dropped in-memory jobs gracefully |

**Deliverable: Milestone 1 MVP** — Web application that generates farewell videos with the deceased speaking their wills.

---

### Phase 5 — Digital Avatar & Interaction (Weeks 11–14) — Milestone 2

| Task                  | Details                                                                              |
| --------------------- | ------------------------------------------------------------------------------------ |
| LLM integration       | Integrate an LLM (e.g., Qwen, LLaMA) with persona prompting based on deceased's info |
| Streaming TTS         | Real-time voice cloning for conversational responses                                 |
| Avatar rendering      | Live avatar using a self-hosted Wan model or a real-time avatar framework            |
| Chat interface        | Text/voice input from family → AI avatar responds in character                       |
| Session management    | Store conversation context, allow multi-turn Q&A                                     |
| Self-hosted migration | Move video generation from cloud DashScope Wan2.7 i2v to a self-hosted Wan model     |

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
│   │   ├── routes/             # API route handlers
│   │   ├── services/           # tts/video service clients, job processor
│   │   ├── queue/              # BullMQ job definitions & workers
│   │   ├── middleware/         # Upload, validation, error handling
│   │   ├── config/             # Environment config
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── tts-service/                # FastAPI · Qwen3-TTS voice cloning (:8200)
│   ├── app/                    # FastAPI app, runner, config
│   ├── scripts/                # quality-threshold test
│   └── pyproject.toml          # uv-managed deps
├── video-service/              # FastAPI · DashScope Wan2.7 i2v (:8300)
│   ├── app/                    # main, routes, dashscope, storage, jobs, schemas
│   ├── scripts/                # standalone DashScope probe
│   └── pyproject.toml          # uv-managed deps
├── docker-compose.yml          # Redis (+ backend)
├── .env.example
├── .gitignore
└── README.md
```

---

## Risk Register

| Risk                                      | Impact | Mitigation                                                                                                      |
| ----------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| DashScope Wan2.7 i2v quality/latency/cost | High   | Tested in Phase 1; tune resolution/duration; self-hosted Wan as Phase 5 fallback                                |
| Cloud dependency (DashScope, S3)          | Medium | Requires public S3 for inputs + outbound DashScope access; expiring result URLs mitigated by re-archiving to S3 |
| Voice cloning quality with short samples  | High   | Require minimum 15s sample; offer recording guidance                                                            |
| Lip sync artifacts ("uncanny valley")     | Medium | Audio-driven Wan2.7 i2v handles lip sync; tune prompt/duration if artifacts appear                              |
| GPU requirements for local demo           | Medium | Video runs in the cloud (DashScope); only TTS runs locally (Apple Silicon MPS)                                  |
| Ethical concerns / deepfake misuse        | High   | Require consent verification; add watermarks; terms of service                                                  |
| Solo developer bandwidth                  | Medium | Prioritize ruthlessly; cut Milestone 2 scope if needed                                                          |

---

## Timeline Summary

| Week  | Phase       | Key Deliverable                                          | Status     |
| ----- | ----------- | -------------------------------------------------------- | ---------- |
| 1     | Scaffolding | Dev environment running                                  | ✅ Done    |
| 2–4   | AI Pipeline | `tts-service` + `video-service` produce a farewell video | ✅ Done    |
| 5–6   | Backend     | Express API + job queue + service orchestration          | ⏳ Pending |
| 7–8   | Frontend    | Upload wizard + video result UI                          | ◀ Current  |
| 9–10  | Polish      | **Milestone 1 MVP complete**                             | ⏳ Pending |
| 11–14 | Avatar      | **Milestone 2 MVP complete**                             | ⏳ Pending |

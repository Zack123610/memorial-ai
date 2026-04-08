# Memorial AI — Development Plan

## Project Summary

Memorial AI generates hyper-personalized farewell videos of the deceased using a single photo, a voice sample, and farewell text. The system clones the voice (Qwen TTS), generates a realistic talking-head video (Seedance 2.0 API → later Wan 2.2 self-hosted), and delivers the result through a web application (React + Vite frontend, Express backend, ComfyUI for AI pipeline orchestration).

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENT (React + Vite)                     │
│  Upload UI  →  Progress Tracker  →  Video Player / Download      │
└──────────────────────┬───────────────────────────────────────────┘
                       │ REST / WebSocket
┌──────────────────────▼───────────────────────────────────────────┐
│                     BACKEND (Express + Node.js)                   │
│  Auth · File Upload · Job Queue (BullMQ) · ComfyUI Client · API  │
└──────┬───────────────────────────┬───────────────────────────────┘
       │ ComfyUI API              │ HTTP/REST
┌──────▼──────────┐     ┌─────────▼─────────┐
│   ComfyUI       │     │  Seedance 2.0 API │
│  (local GPU)    │     │  (cloud, phase 1)  │
│  - Face prep    │     └───────────────────┘
│  - Qwen TTS     │
│  - Lip sync     │
│  - Compositing  │
└─────────────────┘
       │
┌──────▼──────────┐
│   File Storage   │
│  (local / S3)    │
└─────────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 18 + Vite + TailwindCSS | SPA with upload wizard, progress tracking, video preview |
| Backend | Node.js + Express + BullMQ | REST API, job queue, file handling, ComfyUI orchestration |
| AI Pipeline | ComfyUI (Python) | Orchestrates the full AI generation workflow |
| Voice Cloning | Qwen TTS (CosyVoice) | Text-to-speech with voice cloning from sample |
| Video Generation | Seedance 2.0 API (Phase 1) → Wan 2.2 (Phase 2) | Image-to-video / talking-head generation |
| Lip Sync | Wav2Lip / SadTalker / MuseTalk | Sync generated audio to face video |
| Database | SQLite (MVP) → PostgreSQL (prod) | Job metadata, user sessions |
| Storage | Local filesystem (MVP) → S3 (prod) | Uploaded assets + generated videos |
| Realtime | Socket.IO | Progress updates from backend to frontend |

---

## Phase Breakdown

### Phase 0 — Project Scaffolding & Environment (Week 1)

| Task | Details |
|---|---|
| Monorepo setup | `/client` (React+Vite), `/server` (Express), `/comfyui` (workflows) |
| Dev environment | Docker Compose for ComfyUI + backend; local GPU setup |
| ComfyUI installation | Install ComfyUI + required custom nodes (Qwen TTS node, video nodes) |
| CI basics | ESLint, Prettier, Husky pre-commit hooks |
| Git workflow | `main` → `dev` → feature branches |

**Deliverable:** Running dev environment with ComfyUI accessible at `localhost:8188`, Express at `localhost:3001`, React at `localhost:5173`.

---

### Phase 1 — Core AI Pipeline (Weeks 2–4) ★ Critical Path

This is the hardest part. Get the AI pipeline working end-to-end before building any UI.

**Step 1: Voice Cloning Module (Week 2)**
- Install Qwen TTS (CosyVoice) as a ComfyUI custom node or standalone service
- Build ComfyUI workflow: `voice_sample.wav` + `text` → `cloned_speech.wav`
- Test with varying voice sample lengths (5s, 15s, 30s) to find quality threshold
- Output: WAV file with cloned voice speaking the farewell text

**Step 2: Video Generation Module (Week 3)**
- Integrate Seedance 2.0 API calls (image → video)
- Build Express service to call Seedance API: `photo.jpg` + `prompt` → `base_video.mp4`
- Handle API rate limits, retries, and async polling for results
- Output: A short video of the person from the photo with natural movement

**Step 3: Lip Sync + Compositing (Week 4)**
- Integrate a lip-sync model (SadTalker or MuseTalk) as ComfyUI node
- Build ComfyUI workflow: `base_video.mp4` + `cloned_speech.wav` → `final_video.mp4`
- Add post-processing: color correction, fade-in/fade-out, optional background music
- Output: Final composited farewell video

**End-to-end ComfyUI workflow:**

```
[Input Image] ──→ [Seedance 2.0 API] ──→ [Base Video]
                                              │
[Voice Sample + Text] ──→ [Qwen TTS] ──→ [Cloned Audio]
                                              │
                                     [Lip Sync Model]
                                              │
                                     [Final Video Output]
```

**Deliverable:** A single ComfyUI workflow that can be triggered via API and produces a farewell video from photo + voice sample + text.

---

### Phase 2 — Backend API & Job System (Weeks 5–6)

**Step 1: Express API (Week 5)**

| Endpoint | Method | Description |
|---|---|---|
| `/api/upload` | POST | Multipart upload: image, voice sample, text |
| `/api/jobs` | POST | Create a new video generation job |
| `/api/jobs/:id` | GET | Get job status + result URL |
| `/api/jobs/:id/video` | GET | Stream/download the generated video |

- File upload with Multer (validate image formats, audio formats, file size limits)
- BullMQ job queue backed by Redis for async processing
- Worker process that calls ComfyUI API to trigger the workflow
- Job status tracking: `queued → processing → voice_cloning → video_generating → lip_syncing → completed / failed`

**Step 2: ComfyUI Integration (Week 6)**
- Build a ComfyUI API client in Node.js (REST + WebSocket for progress)
- Map job parameters to ComfyUI workflow inputs
- Handle ComfyUI output file retrieval
- Error handling and retry logic
- Socket.IO events to push progress updates to frontend

**Deliverable:** Backend API that accepts uploads, queues jobs, triggers ComfyUI, and returns video results.

---

### Phase 3 — Frontend Web Application (Weeks 7–8)

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

| Task | Details |
|---|---|
| End-to-end testing | Full flow: upload → queue → generate → download |
| Edge cases | No face detected, poor audio quality, very long text |
| Performance | Optimize video generation time, add caching |
| Quality tuning | Adjust TTS parameters, video resolution, lip sync accuracy |
| Demo preparation | Record demo video, prepare presentation materials |
| Error recovery | Handle ComfyUI crashes, API timeouts gracefully |

**Deliverable: Milestone 1 MVP** — Web application that generates farewell videos with the deceased speaking their wills.

---

### Phase 5 — Digital Avatar & Interaction (Weeks 11–14) — Milestone 2

| Task | Details |
|---|---|
| LLM integration | Integrate an LLM (e.g., Qwen, LLaMA) with persona prompting based on deceased's info |
| Streaming TTS | Real-time voice cloning for conversational responses |
| Avatar rendering | Live avatar using Wan 2.2 (self-hosted) or a real-time avatar framework |
| Chat interface | Text/voice input from family → AI avatar responds in character |
| Session management | Store conversation context, allow multi-turn Q&A |
| Self-hosted migration | Move from Seedance 2.0 API to self-hosted Wan 2.2 model |

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
│   │   ├── services/           # ComfyUI client, job processor
│   │   ├── queue/              # BullMQ job definitions & workers
│   │   ├── middleware/         # Upload, validation, error handling
│   │   ├── config/             # Environment config
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── comfyui/                    # ComfyUI workflows & custom nodes
│   ├── workflows/              # JSON workflow files
│   │   ├── voice_clone.json
│   │   ├── video_gen.json
│   │   └── full_pipeline.json
│   └── custom_nodes/           # Any custom ComfyUI nodes
├── docker-compose.yml          # ComfyUI + Redis + backend
├── .env.example
├── .gitignore
└── README.md
```

---

## Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Seedance 2.0 API quality/latency | High | Test early (Week 3); have Wan 2.2 as fallback |
| Voice cloning quality with short samples | High | Require minimum 15s sample; offer recording guidance |
| Lip sync artifacts ("uncanny valley") | Medium | Try multiple models (SadTalker, MuseTalk, Wav2Lip); tune parameters |
| GPU requirements for local demo | Medium | Use API-based models for MVP; self-host only in Phase 5 |
| Ethical concerns / deepfake misuse | High | Require consent verification; add watermarks; terms of service |
| Solo developer bandwidth | Medium | Prioritize ruthlessly; cut Milestone 2 scope if needed |

---

## Timeline Summary

| Week | Phase | Key Deliverable |
|---|---|---|
| 1 | Scaffolding | Dev environment running |
| 2–4 | AI Pipeline | End-to-end video generation in ComfyUI |
| 5–6 | Backend | Express API + job queue + ComfyUI integration |
| 7–8 | Frontend | Upload wizard + video result UI |
| 9–10 | Polish | **Milestone 1 MVP complete** |
| 11–14 | Avatar | **Milestone 2 MVP complete** |

# Video Service

Memorial AI's video-generation service. Turns a **portrait image** + an optional
**driving audio** clip + a **prompt** into a talking-head farewell video, using
Aliyun **DashScope Wan2.7 image-to-video (i2v)**.

FastAPI + `uv`, Python 3.12.

## How it works

DashScope only accepts publicly-reachable media URLs and runs generation
asynchronously, so the service wraps that into a simple job API:

```
POST /api/v1/jobs            client uploads image (+ optional audio) + prompt
   │
   ├─ 1. upload inputs to S3                        → public URLs
   ├─ 2. submit DashScope async video-synthesis job → task_id
   ├─ 3. poll /tasks/{id} until SUCCEEDED / FAILED
   └─ 4. download result, re-upload to S3           → stable video_url

GET  /api/v1/jobs/{job_id}   client polls for status + final video_url
```

Inputs are uploaded to S3 because DashScope must fetch them by URL. The finished
video is **re-archived to S3** as well — DashScope-hosted result URLs expire, so
this gives callers a stable URL.

> **Note:** jobs are tracked **in process memory**. Restarting the service drops
> in-flight jobs. A durable queue (BullMQ/Redis, per the root README) is a later
> phase.

## Endpoints

### `POST /api/v1/jobs`

`multipart/form-data`. Returns `202` with a `job_id`.

| Field           | Type             | Required | Default                       |
| --------------- | ---------------- | -------- | ----------------------------- |
| `image`         | file (`image/*`) | yes      | —                             |
| `audio`         | file (`audio/*`) | no       | none (motion-only generation) |
| `prompt`        | text             | yes      | —                             |
| `resolution`    | text             | no       | `VIDEO_DEFAULT_RESOLUTION`    |
| `duration`      | int (seconds)    | no       | `VIDEO_DEFAULT_DURATION`      |
| `prompt_extend` | bool             | no       | `VIDEO_DEFAULT_PROMPT_EXTEND` |
| `watermark`     | bool             | no       | `VIDEO_DEFAULT_WATERMARK`     |

Limits: image ≤ 25 MB, audio ≤ 50 MB. Wrong content type → `415`; missing
`prompt` → `422`; `DASHSCOPE_API_KEY` unset → `503`.

```jsonc
// 202
{ "job_id": "3f2c…", "status": "queued" }
```

### `GET /api/v1/jobs/{job_id}`

```jsonc
{
  "job_id": "3f2c…",
  "status": "queued | processing | succeeded | failed",
  "detail": "dashscope: RUNNING", // live stage, for progress UIs
  "image_url": "https://…/memorial/inputs/3f2c…/image.jpg",
  "audio_url": "https://…/memorial/inputs/3f2c…/audio.mp3",
  "video_url": "https://…/memorial/outputs/3f2c…/video.mp4", // when succeeded
  "error": null, // populated when failed
  "created_at": 1748600000.0,
  "updated_at": 1748600120.0,
}
```

`404` if the job id is unknown (or was dropped by a restart).

### `GET /api/v1/health`

`{ "status": "ok" }`

## Setup

> **Prerequisites:** Python 3.12, [`uv`](https://docs.astral.sh/uv/), a DashScope
> API key, and an S3 bucket the service can write to and that allows public
> reads of uploaded objects.

```bash
cd video-service
uv sync
cp .env.example .env   # then fill in the values below
```

Required in `.env`:

- `DASHSCOPE_API_KEY` — Aliyun DashScope key.
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` — leave blank to use the default
  AWS credential chain (shared config / instance role) instead.
- `S3_BUCKET` / `S3_REGION` — default to `img-web-req` / `ap-southeast-1`.

See [`.env.example`](./.env.example) for the full list (generation defaults,
poll timeout/interval, S3 prefixes, optional `S3_PUBLIC_BASE` for CDN/custom
domains).

DashScope must be able to GET the uploaded inputs, so the bucket must serve the
`memorial/inputs/...` objects publicly (bucket policy, or front them with
`S3_PUBLIC_BASE`).

## Run

```bash
uv run uvicorn app.main:app --host $VIDEO_HOST --port $VIDEO_PORT
# interactive docs at http://127.0.0.1:8300/docs
```

End-to-end:

```bash
# submit
curl -s localhost:8300/api/v1/jobs \
  -F "image=@portrait.jpg" \
  -F "audio=@voice.mp3" \
  -F "prompt=An elderly man speaking warmly and calmly to the camera"
# → {"job_id":"3f2c…","status":"queued"}

# poll
curl -s localhost:8300/api/v1/jobs/3f2c…
```

## Layout

```
app/
  main.py        FastAPI app + lifespan (shared httpx, S3, DashScope, JobManager)
  config.py      Settings (pydantic-settings; reads .env)
  routes.py      /jobs and /health endpoints + upload validation
  dashscope.py   async DashScope client (submit + poll)
  storage.py     S3 upload helper (boto3)
  jobs.py        in-memory job store + per-job async worker
  schemas.py     request/response models
scripts/
  test_dashscope.py   standalone end-to-end DashScope probe (URLs in/out)
```

## Development

```bash
uv run ruff check app/      # lint
uv run ruff format app/     # format
```

The `scripts/test_dashscope.py` probe talks to DashScope directly with
already-hosted media URLs — handy for verifying the DashScope side without
running the service or touching S3.

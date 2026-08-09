# tts-service

Memorial AI's voice-cloning service. Turns a **reference voice sample** + its
**transcript** + **target text** into speech in that voice, using Aliyun
**DashScope Qwen3-TTS voice cloning**. Runs on `:8200`.

FastAPI + `uv`, Python 3.12.

> **Trial reimplementation.** This service previously ran `Qwen3-TTS-12Hz-1.7B-Base`
> locally through PyTorch. It now calls DashScope instead — the same provider the
> [`video-service`](../video-service/README.md) uses for Wan2.7 i2v — so neither
> service needs a GPU. The `POST /clone` contract is unchanged, so the Express
> backend and its pipeline work against either implementation.

## How it works

DashScope splits cloning and synthesis into two calls, and the cloned voice is
bound to the TTS model it was enrolled for:

```
POST /clone                    backend uploads ref_audio + ref_text + text
   │
   ├─ 1. enroll the voice        POST /services/audio/tts/customization
   │      (base64 sample)        model=qwen-voice-enrollment → voice name
   ├─ 2. synthesize              POST /services/aigc/multimodal-generation/generation
   │                             model=qwen3-tts-vc-… + voice → temporary audio URL
   └─ 3. download the audio and return the bytes
```

Enrollment costs a call and a voice slot, so voices are **cached in memory** by a
digest of the reference sample and reused for `TTS_VOICE_CACHE_TTL`. Voices this
process created are deleted on shutdown, since DashScope caps how many an
account may hold. Restarting the service therefore starts from an empty cache.

Unlike `video-service`, no S3 bucket is needed: the reference sample is sent
inline as a base64 data URL, and the rendered audio is returned to the caller in
the response body rather than hosted.

## Endpoints

### `POST /clone` (multipart/form-data)

| Field       | Type   | Notes                                             |
| ----------- | ------ | ------------------------------------------------- |
| `ref_audio` | file   | WAV / MP3 / M4A, 3–60s, mono, ≤7 MB               |
| `ref_text`  | string | Transcript of `ref_audio` (DashScope verifies it) |
| `text`      | string | Target text to synthesize                         |
| `language`  | string | `English` (default), `Chinese`, … or `Auto`       |

Supported languages: Chinese, English, German, Italian, Portuguese, Spanish,
Japanese, Korean, French, Russian, plus `Auto` for detection.

Returns the rendered audio (`audio/wav`) with these response headers:

- `X-Sample-Rate` — sample rate of the returned audio
- `X-Elapsed-Seconds` — enrollment + synthesis + download time
- `X-Ref-Duration-Seconds` — measured length of the reference audio
- `X-Language` — language used for synthesis
- `X-Voice` — DashScope voice name used
- `X-Voice-Cached` — `true` when an existing enrollment was reused
- `X-Voice-Fallback` — present when DashScope degraded the clone (poor sample)
- `X-Dashscope-Request-Id` — for support / debugging

Errors: bad or oversized sample → `400`; unsupported `language` → `400`;
`DASHSCOPE_API_KEY` unset → `503`; DashScope rejection → `502`.

```bash
curl -sS -X POST http://localhost:8200/clone \
  -F "ref_audio=@sample.wav" \
  -F "ref_text=The transcript of what is said in sample.wav" \
  -F "text=Hello from beyond." \
  -F "language=English" \
  --output cloned.wav
```

### `GET /health`

```json
{
  "status": "ok",
  "provider": "dashscope",
  "model": "qwen3-tts-vc-2026-01-22",
  "enrollment_model": "qwen-voice-enrollment",
  "api_key_configured": true,
  "cached_voices": 0
}
```

## Setup

> **Prerequisites:** Python 3.12, [`uv`](https://docs.astral.sh/uv/), and a
> DashScope API key. No GPU and no model download.

```bash
cd tts-service
uv sync
cp .env.example .env   # then set DASHSCOPE_API_KEY
```

Required in `.env`:

- `DASHSCOPE_API_KEY` — Aliyun DashScope key (the same one `video-service` uses).
- `TTS_DASHSCOPE_BASE` — regional endpoint; use
  `https://dashscope-intl.aliyuncs.com` for a Singapore key.

`TTS_ENROLLMENT_MODEL` and `TTS_DASHSCOPE_MODEL` must stay compatible: a voice
enrolled with `target_model` X can only be used to synthesize with model X. See
[`.env.example`](./.env.example) for the full list (reference-audio limits,
voice-cache TTL/size, request timeout).

## Run

```bash
uv run uvicorn app.main:app --host $TTS_HOST --port $TTS_PORT
# or: uv run python -m app.main
# interactive docs at http://127.0.0.1:8200/docs
```

## Reference audio guidance

DashScope's requirements for the cloning sample:

- 10–20s recommended, 60s maximum, at least 3s of continuous clear speech
- mono, 24 kHz or higher, no background music or noise
- WAV (16-bit), MP3 or M4A, under 10 MB once base64-encoded (`TTS_MAX_REF_BYTES`
  caps the raw upload at 7 MB to leave room for that overhead)

If the audio is noisy or does not match `ref_text`, DashScope may clone in
_fallback mode_ — the request still succeeds but quality drops, so the service
logs a warning and sets `X-Voice-Fallback`.

## Scripts

```bash
# End-to-end DashScope probe — no service, no S3, cleans up the voice afterwards
uv run python scripts/test_dashscope_tts.py sample.wav "Hello from beyond." "Sample transcript"

# Minimum-sample-length check: clones the same text from 5s/15s/30s slices
# (needs the service running)
uv run python scripts/test_quality.py path/to/long_sample.wav "Sample transcript" "Hello world"
```

Outputs land in `storage/`.

## Development

```bash
uv run ruff check app/      # lint
uv run ruff format app/     # format
```

## Layout

```
app/
  main.py        FastAPI app + lifespan (shared httpx, DashScope client, VoiceRegistry)
  config.py      Settings (pydantic-settings; reads .env)
  dashscope.py   async DashScope client (enroll / synthesize / delete)
  voices.py      in-memory enrollment cache + cleanup
  audio.py       reference-audio validation and base64 encoding
  schemas.py     health model + supported languages
  routes/
    tts.py       POST /clone
    health.py    GET /health
scripts/
  test_dashscope_tts.py   standalone end-to-end DashScope probe
  test_quality.py         reference-length quality comparison via the service
```

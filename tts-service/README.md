# tts-service

FastAPI service wrapping **Qwen3-TTS-12Hz-1.7B-Base** for zero-shot voice cloning. Runs on `:8200`.

> The **Base** model is used because it supports zero-shot cloning from reference audio. The `CustomVoice` variant only supports predefined speakers and cannot clone a voice.

## Setup (M1 Pro / Apple Silicon)

```bash
cd tts-service
uv sync                # creates .venv, installs deps
cp .env.example .env
```

`uv sync` will pull torch, qwen-tts, and friends — first run downloads ~2 GB of wheels.

## Run

```bash
uv run python -m app.main
# or, with auto-reload during development:
uv run uvicorn app.main:app --reload --port 8200
```

The first `/clone` request will download the model weights (~3.8 GB) into the HuggingFace cache (`~/.cache/huggingface/hub/`). Set `TTS_EAGER_LOAD=true` to load at startup instead.

## API

### `GET /health`

```json
{
  "status": "ok",
  "model_loaded": false,
  "device": "mps",
  "dtype": "float16",
  "model_id": "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
}
```

### `POST /clone` (multipart/form-data)

| Field       | Type   | Notes                             |
| ----------- | ------ | --------------------------------- |
| `ref_audio` | file   | WAV or MP3, 3–60s, mono preferred |
| `ref_text`  | string | Transcript of `ref_audio`         |
| `text`      | string | Target text to synthesize         |
| `language`  | string | `English` or `Chinese`            |

Returns `audio/wav` (PCM 16-bit) with these response headers:

- `X-Sample-Rate` — output sample rate
- `X-Elapsed-Seconds` — model inference time
- `X-Ref-Duration-Seconds` — measured length of the reference audio

```bash
curl -sS -X POST http://localhost:8200/clone \
  -F "ref_audio=@sample.wav" \
  -F "ref_text=The transcript of what is said in sample.wav" \
  -F "text=Hello from beyond." \
  -F "language=English" \
  --output cloned.wav
```

## Quality threshold test

`scripts/test_quality.py` slices one reference WAV into 5s/15s/30s clips and runs the same target text against each — useful for finding the minimum sample length for acceptable quality.

```bash
uv run python scripts/test_quality.py path/to/long_sample.wav "Sample transcript" "Hello world"
```

Outputs land in `storage/quality_test/`.

## Apple Silicon notes

- Default config uses PyTorch's MPS backend with `float16`. M1 Pro inference is meaningfully slower than CUDA but workable for development.
- `flash_attention_2` is NVIDIA-only and is automatically swapped for `sdpa` on non-CUDA devices.
- For faster inference, consider migrating to the MLX-quantized model (`mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit`) — would require a different runner backend.

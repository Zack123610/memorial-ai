# ComfyUI Setup

This directory holds the ComfyUI workflows and any custom nodes used by the Memorial AI pipeline. ComfyUI itself is **not** committed here — it's installed separately because it's multi-GB and depends on your local GPU.

## Layout

```
comfyui/
├── workflows/        # JSON workflow definitions (committed)
├── custom_nodes/     # Project-owned custom nodes (committed)
├── runtime/          # ComfyUI install (gitignored)
├── models/           # Model checkpoints (gitignored)
└── output/           # Generated outputs (gitignored)
```

## Install (one-time)

```bash
cd comfyui
git clone https://github.com/comfyanonymous/ComfyUI.git runtime
cd runtime
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
# Apple Silicon: pip install torch torchvision torchaudio
# NVIDIA: follow https://pytorch.org/get-started/locally/
```

## Custom nodes

The pipeline depends on these (install into `runtime/custom_nodes/`):

- **CosyVoice / Qwen TTS** — voice cloning (Phase 1, Step 1)
- **SadTalker** or **MuseTalk** — lip sync (Phase 1, Step 3)

Install commands will be added as each pipeline step lands.

## Run

```bash
cd comfyui/runtime
source venv/bin/activate
python main.py --listen 127.0.0.1 --port 8188
```

ComfyUI will be reachable at <http://localhost:8188>.

## Workflows

- `workflows/voice_clone.json` — Phase 1, Step 1 (placeholder)
- `workflows/video_gen.json` — Phase 1, Step 2 (placeholder)
- `workflows/full_pipeline.json` — Phase 1, end-to-end (placeholder)

The placeholders are tracked so the structure exists; real workflows are exported from the ComfyUI UI as each step is built.

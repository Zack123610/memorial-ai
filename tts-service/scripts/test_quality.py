"""Quality threshold test: clone the same target text using 5s, 15s, 30s slices of one reference.

Usage:
    uv run python scripts/test_quality.py <ref_audio> <ref_text> <target_text> [language]

Outputs land in storage/quality_test/<duration>s.wav with timing in stdout.
This calls the running tts-service over HTTP — start it first with `uv run python -m app.main`.
"""

from __future__ import annotations

import io
import sys
import time
from pathlib import Path

import httpx
import numpy as np
import soundfile as sf

SLICES_SEC = [5, 15, 30]
SERVICE_URL = "http://127.0.0.1:8200"
OUT_DIR = Path("storage/quality_test")


def slice_to_wav_bytes(audio: np.ndarray, sr: int, seconds: float) -> bytes:
    n = min(int(seconds * sr), len(audio))
    buf = io.BytesIO()
    sf.write(buf, audio[:n], sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def main() -> int:
    if len(sys.argv) < 4:
        print(__doc__)
        return 2

    ref_path = Path(sys.argv[1])
    ref_text = sys.argv[2]
    target_text = sys.argv[3]
    language = sys.argv[4] if len(sys.argv) > 4 else "English"

    audio, sr = sf.read(ref_path, dtype="float32", always_2d=False)
    if audio.ndim == 2:
        audio = audio.mean(axis=1)
    total = len(audio) / sr
    print(f"loaded {ref_path} — {total:.1f}s @ {sr}Hz")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    with httpx.Client(timeout=600.0) as client:
        for secs in SLICES_SEC:
            if total < secs:
                print(f"skip {secs}s (reference is only {total:.1f}s)")
                continue
            wav_bytes = slice_to_wav_bytes(audio, sr, secs)
            t0 = time.perf_counter()
            r = client.post(
                f"{SERVICE_URL}/clone",
                files={"ref_audio": (f"ref_{secs}s.wav", wav_bytes, "audio/wav")},
                data={"ref_text": ref_text, "text": target_text, "language": language},
            )
            elapsed = time.perf_counter() - t0
            r.raise_for_status()
            out_path = OUT_DIR / f"{secs}s.wav"
            out_path.write_bytes(r.content)
            print(
                f"{secs:>2}s ref → {out_path}  "
                f"(server={r.headers.get('X-Elapsed-Seconds')}s, total={elapsed:.2f}s)"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

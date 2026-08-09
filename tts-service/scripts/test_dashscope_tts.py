"""Test DashScope Qwen3-TTS voice cloning end-to-end, without running the service.

Usage:
    uv run python scripts/test_dashscope_tts.py <ref_audio> <target_text> [ref_text] [language]

Flow:
    1. POST /api/v1/services/audio/tts/customization  → clone a voice (base64 sample)
    2. POST /api/v1/services/aigc/multimodal-generation/generation → synthesize
    3. download the rendered audio to storage/test_dashscope_tts/
    4. delete the cloned voice again (DashScope caps how many you may hold)

Requires DASHSCOPE_API_KEY in the environment or tts-service/.env.
"""

from __future__ import annotations

import base64
import mimetypes
import os
import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

SERVICE_ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = SERVICE_ROOT / "storage" / "test_dashscope_tts"

CUSTOMIZATION_PATH = "/api/v1/services/audio/tts/customization"
GENERATION_PATH = "/api/v1/services/aigc/multimodal-generation/generation"

LANGUAGE_CODES = {
    "Chinese": "zh",
    "English": "en",
    "German": "de",
    "Italian": "it",
    "Portuguese": "pt",
    "Spanish": "es",
    "Japanese": "ja",
    "Korean": "ko",
    "French": "fr",
    "Russian": "ru",
}

# DashScope only accepts these three MIME types for the reference sample.
MIME_OVERRIDES = {".m4a": "audio/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav"}


def data_uri(path: Path) -> str:
    mime = MIME_OVERRIDES.get(path.suffix.lower()) or mimetypes.guess_type(path.name)[0]
    if mime not in {"audio/wav", "audio/mpeg", "audio/mp4"}:
        raise SystemExit(f"unsupported reference format '{path.suffix}' (use wav/mp3/m4a)")
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def post(client: httpx.Client, base: str, api_key: str, path: str, payload: dict) -> dict:
    r = client.post(
        f"{base}{path}",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=payload,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"{path} failed {r.status_code}: {r.text[:500]}")
    body = r.json()
    if body.get("code"):
        raise RuntimeError(f"{path} returned {body['code']}: {body.get('message', '')}")
    return body


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2

    ref_path = Path(sys.argv[1])
    target_text = sys.argv[2]
    ref_text = sys.argv[3] if len(sys.argv) > 3 else ""
    language = sys.argv[4] if len(sys.argv) > 4 else "English"

    if not ref_path.exists():
        print(f"error: reference audio not found: {ref_path}", file=sys.stderr)
        return 2

    load_dotenv(SERVICE_ROOT / ".env")
    api_key = os.environ.get("DASHSCOPE_API_KEY", "").strip()
    if not api_key:
        print("error: DASHSCOPE_API_KEY not set (export it or paste into .env)", file=sys.stderr)
        return 2

    base = os.environ.get("TTS_DASHSCOPE_BASE", "https://dashscope.aliyuncs.com").rstrip("/")
    enrollment_model = os.environ.get("TTS_ENROLLMENT_MODEL", "qwen-voice-enrollment")
    model = os.environ.get("TTS_DASHSCOPE_MODEL", "qwen3-tts-vc-2026-01-22")
    prefix = os.environ.get("TTS_VOICE_PREFIX", "memorial")

    print(f"model:     {model}")
    print(f"reference: {ref_path} ({ref_path.stat().st_size / 1024:.0f} KB)")
    print(f"language:  {language}")

    enroll_input: dict = {
        "action": "create",
        "target_model": model,
        "preferred_name": prefix,
        "audio": {"data": data_uri(ref_path)},
    }
    if language in LANGUAGE_CODES:
        enroll_input["language"] = LANGUAGE_CODES[language]
    if ref_text:
        enroll_input["text"] = ref_text

    voice: str | None = None
    with httpx.Client(timeout=120.0) as client:
        try:
            print("1/4 cloning voice…")
            t0 = time.perf_counter()
            body = post(
                client, base, api_key, CUSTOMIZATION_PATH,
                {"model": enrollment_model, "input": enroll_input},
            )
            voice = body["output"]["voice"]
            print(f"     voice: {voice} ({time.perf_counter() - t0:.1f}s)")
            if body["output"].get("fallback_mode"):
                reason = body["output"].get("fallback_reason", "unspecified")
                print(f"     warning: cloned in fallback mode ({reason}) — quality may suffer")

            print("2/4 synthesizing…")
            t1 = time.perf_counter()
            body = post(
                client, base, api_key, GENERATION_PATH,
                {
                    "model": model,
                    "input": {"text": target_text, "voice": voice, "language_type": language},
                },
            )
            audio_url = body["output"]["audio"]["url"]
            print(f"     audio_url: {audio_url[:100]}… ({time.perf_counter() - t1:.1f}s)")

            print("3/4 downloading…")
            r = client.get(audio_url)
            r.raise_for_status()
            OUT_DIR.mkdir(parents=True, exist_ok=True)
            dest = OUT_DIR / f"{int(time.time())}.wav"
            dest.write_bytes(r.content)
            print(f"     saved: {dest} ({len(r.content) / 1024:.0f} KB)")
        finally:
            if voice:
                print("4/4 deleting cloned voice…")
                with httpx.Client(timeout=60.0) as cleanup:
                    post(
                        cleanup, base, api_key, CUSTOMIZATION_PATH,
                        {"model": enrollment_model, "input": {"action": "delete", "voice": voice}},
                    )

    print("done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

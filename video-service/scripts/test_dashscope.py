"""Test DashScope Wan2.7 i2v video synthesis end-to-end using S3-hosted media.

Usage:
    uv run python scripts/test_dashscope.py [--image FILENAME_OR_URL] [--audio FILENAME_OR_URL] \
        [--prompt TEXT]

Defaults:
    --image   old_man_chatgpt.jpeg  (resolved to https://img-web-req.s3.ap-southeast-1.amazonaws.com/old_man_chatgpt.jpeg)
    --audio   (none — omit for image-only / motion generation)
    --prompt  see DEFAULT_PROMPT below

Pass either a bare filename (e.g. portrait.jpg) and S3_BASE is prepended automatically,
or a full https:// URL to use any publicly accessible media.

Flow:
    1. POST a video-synthesis job (async) with media URLs passed directly to DashScope.
    2. Poll /api/v1/tasks/{id} until SUCCEEDED / FAILED.
    3. Download the resulting video to storage/test_dashscope/{task_id}.mp4.

Requires DASHSCOPE_API_KEY in the environment or video-service/.env.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

SERVICE_ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = SERVICE_ROOT / "storage" / "test_dashscope"

S3_BASE = "https://img-web-req.s3.ap-southeast-1.amazonaws.com"

def to_url(value: str | None) -> str | None:
    if value is None:
        return None
    if value.startswith("https://") or value.startswith("http://"):
        return value
    return f"{S3_BASE}/{value}"


DEFAULT_PROMPT = (
    "An elderly man speaking warmly and calmly to the camera in a quiet room, "
    "gentle natural lighting, dignified mood, subtle head movements that match the audio."
)


def submit_job(
    client: httpx.Client,
    base: str,
    api_key: str,
    model: str,
    prompt: str,
    image_url: str,
    audio_url: str | None,
    resolution: str,
    duration: int,
    prompt_extend: bool,
    watermark: bool,
) -> str:
    media: list[dict] = [{"type": "first_frame", "url": image_url}]
    if audio_url:
        media.append({"type": "driving_audio", "url": audio_url})

    payload = {
        "model": model,
        "input": {
            "prompt": prompt,
            "media": media,
        },
        "parameters": {
            "resolution": resolution,
            "duration": duration,
            "prompt_extend": prompt_extend,
            "watermark": watermark,
        },
    }
    r = client.post(
        f"{base}/api/v1/services/aigc/video-generation/video-synthesis",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "X-DashScope-Async": "enable",
        },
        json=payload,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"submit failed {r.status_code}: {r.text[:500]}")
    body = r.json()
    task_id = body.get("output", {}).get("task_id")
    if not task_id:
        raise RuntimeError(f"no task_id in response: {body}")
    return task_id


def poll_task(
    client: httpx.Client,
    base: str,
    api_key: str,
    task_id: str,
    timeout: float,
    interval: float,
) -> dict:
    deadline = time.monotonic() + timeout
    last_status: str | None = None
    while True:
        r = client.get(
            f"{base}/api/v1/tasks/{task_id}",
            headers={"Authorization": f"Bearer {api_key}"},
        )
        r.raise_for_status()
        body = r.json()
        output = body.get("output", {})
        status = output.get("task_status")
        if status != last_status:
            print(f"     status: {status}")
            last_status = status
        if status == "SUCCEEDED":
            return body
        if status in ("FAILED", "CANCELED", "UNKNOWN"):
            raise RuntimeError(f"task {task_id} ended with {status}: {body}")
        if time.monotonic() > deadline:
            raise TimeoutError(f"task {task_id} did not finish within {timeout:.0f}s")
        time.sleep(interval)


def download_video(client: httpx.Client, url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with client.stream("GET", url) as r:
        r.raise_for_status()
        with dest.open("wb") as f:
            for chunk in r.iter_bytes(chunk_size=1 << 20):
                f.write(chunk)


def main() -> int:
    parser = argparse.ArgumentParser(description="Test DashScope Wan2.7 i2v end-to-end")
    parser.add_argument(
        "--image",
        default="old_man_chatgpt.jpeg",
        help="filename on S3 (e.g. old_man.jpg) or a full https:// URL",
    )
    parser.add_argument(
        "--audio",
        default=None,
        help="filename on S3 (e.g. voice.mp3) or a full https:// URL (optional)",
    )
    parser.add_argument("--prompt", default=DEFAULT_PROMPT)
    args = parser.parse_args()

    load_dotenv(SERVICE_ROOT / ".env")
    api_key = os.environ.get("DASHSCOPE_API_KEY", "").strip()
    if not api_key:
        print("error: DASHSCOPE_API_KEY not set (export it or paste into .env)", file=sys.stderr)
        return 2

    base = os.environ.get("VIDEO_DASHSCOPE_BASE", "https://dashscope.aliyuncs.com").rstrip("/")
    model = os.environ.get("VIDEO_DASHSCOPE_MODEL", "wan2.7-i2v-2026-04-25")
    resolution = os.environ.get("VIDEO_DEFAULT_RESOLUTION", "720P")
    duration = int(os.environ.get("VIDEO_DEFAULT_DURATION", "5"))
    prompt_extend = os.environ.get("VIDEO_DEFAULT_PROMPT_EXTEND", "true").lower() == "true"
    watermark = os.environ.get("VIDEO_DEFAULT_WATERMARK", "false").lower() == "true"
    timeout = float(os.environ.get("VIDEO_TASK_TIMEOUT", "900"))
    interval = float(os.environ.get("VIDEO_POLL_INTERVAL", "5"))

    image_url = to_url(args.image)
    audio_url = to_url(args.audio)

    print(f"model:     {model}")
    print(f"image-url: {image_url}")
    print(f"audio-url: {audio_url or '(none)'}")
    preview = args.prompt[:80] + ("…" if len(args.prompt) > 80 else "")
    print(f"prompt:    {preview}")

    with httpx.Client(timeout=120.0) as client:
        print("1/3 submitting video synthesis job…")
        t0 = time.perf_counter()
        task_id = submit_job(
            client, base, api_key, model, args.prompt,
            image_url, audio_url,
            resolution, duration, prompt_extend, watermark,
        )
        print(f"     task_id: {task_id}")

        print(f"2/3 polling (timeout {int(timeout)}s, every {int(interval)}s)…")
        body = poll_task(client, base, api_key, task_id, timeout, interval)
        elapsed = time.perf_counter() - t0

        video_url = body.get("output", {}).get("video_url")
        if not video_url:
            print(f"task succeeded but no video_url in response: {body}", file=sys.stderr)
            return 1
        print(f"     video_url: {video_url}")
        print(f"     elapsed:   {elapsed:.1f}s")

        dest = OUT_DIR / f"{task_id}.mp4"
        print(f"3/3 downloading → {dest}")
        download_video(client, video_url, dest)

    print("done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

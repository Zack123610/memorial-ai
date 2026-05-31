"""Async DashScope Wan2.7 i2v client.

Mirrors the proven flow in scripts/test_dashscope.py: submit an async
video-synthesis job, then poll /api/v1/tasks/{id} until it settles.
"""

from __future__ import annotations

import httpx

from .config import Settings


class DashScopeError(RuntimeError):
    """Raised when DashScope rejects a request or a task ends unsuccessfully."""


class DashScopeClient:
    def __init__(self, settings: Settings, client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._client = client
        self._base = settings.video_dashscope_base.rstrip("/")

    def _auth(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._settings.dashscope_api_key}"}

    async def submit_job(
        self,
        *,
        prompt: str,
        image_url: str,
        audio_url: str | None,
        resolution: str,
        duration: int,
        prompt_extend: bool,
        watermark: bool,
    ) -> str:
        """Submit an async video-synthesis job and return its task_id."""
        media: list[dict] = [{"type": "first_frame", "url": image_url}]
        if audio_url:
            media.append({"type": "driving_audio", "url": audio_url})

        payload = {
            "model": self._settings.video_dashscope_model,
            "input": {"prompt": prompt, "media": media},
            "parameters": {
                "resolution": resolution,
                "duration": duration,
                "prompt_extend": prompt_extend,
                "watermark": watermark,
            },
        }
        r = await self._client.post(
            f"{self._base}/api/v1/services/aigc/video-generation/video-synthesis",
            headers={
                **self._auth(),
                "Content-Type": "application/json",
                "X-DashScope-Async": "enable",
            },
            json=payload,
        )
        if r.status_code >= 400:
            raise DashScopeError(f"submit failed {r.status_code}: {r.text[:500]}")
        task_id = r.json().get("output", {}).get("task_id")
        if not task_id:
            raise DashScopeError(f"no task_id in response: {r.json()}")
        return task_id

    async def get_task(self, task_id: str) -> dict:
        """Fetch the current task body; ``output.task_status`` holds the state."""
        r = await self._client.get(
            f"{self._base}/api/v1/tasks/{task_id}",
            headers=self._auth(),
        )
        r.raise_for_status()
        return r.json()

"""FastAPI application entrypoint.

Run: ``uv run uvicorn app.main:app --host $TTS_HOST --port $TTS_PORT``
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI

from .config import get_settings
from .dashscope import DashScopeTtsClient
from .routes import health, tts
from .voices import VoiceRegistry

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    # One shared client: the timeout covers enrollment, synthesis and the
    # download of the rendered audio.
    http = httpx.AsyncClient(timeout=settings.tts_request_timeout)
    dashscope = DashScopeTtsClient(settings, http)
    app.state.settings = settings
    app.state.dashscope = dashscope
    app.state.voices = VoiceRegistry(settings, dashscope)
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    try:
        yield
    finally:
        await app.state.voices.shutdown()
        await http.aclose()


app = FastAPI(title="Memorial AI — TTS Service", version="0.2.0", lifespan=lifespan)
app.include_router(health.router, prefix="")
app.include_router(tts.router, prefix="")


def main() -> None:
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.tts_host,
        port=settings.tts_port,
        reload=False,
    )


if __name__ == "__main__":
    main()

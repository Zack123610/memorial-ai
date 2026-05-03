from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .config import settings
from .models.qwen_tts import QwenTtsRunner
from .routes import health, tts

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    runner = QwenTtsRunner(
        model_id=settings.model_id,
        device=settings.device,
        dtype_name=settings.dtype,
    )
    if settings.eager_load:
        runner.load()
    app.state.runner = runner
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="Memorial AI — TTS Service", version="0.1.0", lifespan=lifespan)
app.include_router(health.router, prefix="")
app.include_router(tts.router, prefix="")


def main() -> None:
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
    )


if __name__ == "__main__":
    main()

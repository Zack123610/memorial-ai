"""FastAPI application entrypoint.

Run: ``uv run uvicorn app.main:app --host $VIDEO_HOST --port $VIDEO_PORT``
"""

from __future__ import annotations

from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI

from .config import get_settings
from .dashscope import DashScopeClient
from .jobs import JobManager
from .routes import router
from .storage import S3Storage


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    # One shared client: long timeout covers submit + result download.
    http = httpx.AsyncClient(timeout=120.0)
    storage = S3Storage(settings)
    dashscope = DashScopeClient(settings, http)
    app.state.settings = settings
    app.state.job_manager = JobManager(settings, dashscope, storage, http)
    try:
        yield
    finally:
        await app.state.job_manager.shutdown()
        await http.aclose()


app = FastAPI(title="Memorial AI — Video Service", version="0.1.0", lifespan=lifespan)
app.include_router(router, prefix="/api/v1")

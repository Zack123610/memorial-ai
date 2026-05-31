"""HTTP endpoints for video-generation jobs."""

from __future__ import annotations

import os

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile

from .config import Settings
from .jobs import JobManager, _Upload
from .schemas import JobCreatedResponse, JobStatusResponse

router = APIRouter()

# Generous caps so we reject obviously-wrong inputs without truncating real media.
_MAX_IMAGE_BYTES = 25 * 1024 * 1024
_MAX_AUDIO_BYTES = 50 * 1024 * 1024


def _manager(request: Request) -> JobManager:
    return request.app.state.job_manager


def _settings(request: Request) -> Settings:
    return request.app.state.settings


async def _read_upload(upload: UploadFile, *, expect: str, limit: int) -> _Upload:
    content_type = upload.content_type or ""
    if not content_type.startswith(f"{expect}/"):
        got = content_type or "unknown"
        raise HTTPException(
            status_code=415,
            detail=f"expected {expect}/* for '{upload.filename}', got '{got}'",
        )
    data = await upload.read()
    if not data:
        raise HTTPException(status_code=400, detail=f"empty {expect} upload")
    if len(data) > limit:
        raise HTTPException(
            status_code=413,
            detail=f"{expect} exceeds {limit // (1024 * 1024)}MB limit",
        )
    ext = os.path.splitext(upload.filename or "")[1].lower()
    return _Upload(data=data, content_type=content_type, ext=ext)


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.post("/jobs", response_model=JobCreatedResponse, status_code=202)
async def create_job(
    request: Request,
    image: UploadFile = File(..., description="portrait image (first frame)"),
    audio: UploadFile | None = File(None, description="driving audio (optional)"),
    prompt: str = Form(...),
    resolution: str | None = Form(None),
    duration: int | None = Form(None),
    prompt_extend: bool | None = Form(None),
    watermark: bool | None = Form(None),
) -> JobCreatedResponse:
    settings = _settings(request)
    if not settings.dashscope_api_key:
        raise HTTPException(status_code=503, detail="DASHSCOPE_API_KEY not configured")
    if not prompt.strip():
        raise HTTPException(status_code=400, detail="prompt must not be empty")

    image_upload = await _read_upload(image, expect="image", limit=_MAX_IMAGE_BYTES)
    audio_upload = (
        await _read_upload(audio, expect="audio", limit=_MAX_AUDIO_BYTES)
        if audio is not None
        else None
    )

    job = _manager(request).submit(
        prompt=prompt,
        resolution=resolution or settings.video_default_resolution,
        duration=duration if duration is not None else settings.video_default_duration,
        prompt_extend=(
            prompt_extend if prompt_extend is not None else settings.video_default_prompt_extend
        ),
        watermark=watermark if watermark is not None else settings.video_default_watermark,
        image=image_upload,
        audio=audio_upload,
    )
    return JobCreatedResponse(job_id=job.id, status=job.status)


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job(request: Request, job_id: str) -> JobStatusResponse:
    job = _manager(request).get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return JobStatusResponse(
        job_id=job.id,
        status=job.status,
        detail=job.detail,
        image_url=job.image_url,
        audio_url=job.audio_url,
        video_url=job.video_url,
        error=job.error,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )

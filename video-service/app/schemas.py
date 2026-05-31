"""Request/response models for the video-generation API."""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel


class JobStatus(StrEnum):
    queued = "queued"
    processing = "processing"
    succeeded = "succeeded"
    failed = "failed"


class JobCreatedResponse(BaseModel):
    job_id: str
    status: JobStatus


class JobStatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    # Human-readable stage / DashScope task status, useful for progress UIs.
    detail: str | None = None
    image_url: str | None = None
    audio_url: str | None = None
    video_url: str | None = None
    error: str | None = None
    created_at: float
    updated_at: float

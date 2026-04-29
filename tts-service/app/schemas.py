from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

Language = Literal["English", "Chinese"]


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    device: str
    dtype: str
    model_id: str


class CloneMetadata(BaseModel):
    sample_rate: int
    duration_seconds: float
    language: Language
    elapsed_seconds: float

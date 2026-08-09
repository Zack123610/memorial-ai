from __future__ import annotations

from fastapi import APIRouter, Request

from ..config import Settings
from ..schemas import HealthResponse
from ..voices import VoiceRegistry

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health(request: Request) -> HealthResponse:
    settings: Settings = request.app.state.settings
    registry: VoiceRegistry = request.app.state.voices
    return HealthResponse(
        status="ok",
        provider="dashscope",
        model=settings.tts_dashscope_model,
        enrollment_model=settings.tts_enrollment_model,
        api_key_configured=bool(settings.dashscope_api_key),
        cached_voices=registry.size,
    )

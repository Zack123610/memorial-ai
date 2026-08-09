from __future__ import annotations

import time
from typing import Annotated

import httpx
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response

from .. import audio as audio_utils
from ..audio import RefAudioError
from ..config import Settings
from ..dashscope import DashScopeError, DashScopeTtsClient
from ..schemas import LANGUAGE_CODES, SUPPORTED_LANGUAGES
from ..voices import VoiceRegistry

router = APIRouter()


@router.post(
    "/clone",
    responses={200: {"content": {"audio/wav": {}}}},
    response_class=Response,
)
async def clone(
    request: Request,
    ref_audio: Annotated[UploadFile, File(description="Reference voice sample (WAV/MP3/M4A)")],
    ref_text: Annotated[str, Form(description="Transcript of the reference audio")],
    text: Annotated[str, Form(description="Target text to synthesize")],
    language: Annotated[str, Form(description=f"One of {SUPPORTED_LANGUAGES}")] = "English",
) -> Response:
    settings: Settings = request.app.state.settings
    client: DashScopeTtsClient = request.app.state.dashscope
    registry: VoiceRegistry = request.app.state.voices

    if not settings.dashscope_api_key:
        raise HTTPException(503, "DASHSCOPE_API_KEY not configured")
    if language not in SUPPORTED_LANGUAGES:
        raise HTTPException(400, f"language must be one of {SUPPORTED_LANGUAGES}")
    if not ref_text.strip():
        raise HTTPException(400, "ref_text required (transcript of the reference audio)")
    if not text.strip():
        raise HTTPException(400, "text required")

    raw = await ref_audio.read()
    try:
        reference = audio_utils.prepare(
            raw,
            content_type=ref_audio.content_type,
            filename=ref_audio.filename,
            max_bytes=settings.tts_max_ref_bytes,
            min_seconds=settings.tts_min_ref_seconds,
            max_seconds=settings.tts_max_ref_seconds,
        )
    except RefAudioError as exc:
        raise HTTPException(400, str(exc)) from exc

    language_code = LANGUAGE_CODES.get(language)
    enrollment_text = ref_text.strip() if settings.tts_send_ref_text else None
    cache_key = VoiceRegistry.key(
        audio_digest=reference.digest,
        target_model=settings.tts_dashscope_model,
        language_code=language_code,
        ref_text=enrollment_text or "",
    )

    started = time.perf_counter()
    try:
        voice, cached = await registry.get_or_create(
            cache_key=cache_key,
            audio_data_uri=reference.to_data_uri(),
            language_code=language_code,
            ref_text=enrollment_text,
        )
        synthesis = await client.synthesize(text=text, voice=voice.name, language_type=language)
        data, content_type = await client.fetch_audio(synthesis.audio_url)
    except DashScopeError as exc:
        raise HTTPException(502, f"dashscope: {exc}") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"dashscope request failed: {exc}") from exc
    elapsed = time.perf_counter() - started

    _, sample_rate = audio_utils.probe(data)

    headers = {
        "X-Elapsed-Seconds": f"{elapsed:.3f}",
        "X-Language": language,
        "X-Voice": voice.name,
        "X-Voice-Cached": "true" if cached else "false",
        "X-Model": settings.tts_dashscope_model,
    }
    if sample_rate:
        headers["X-Sample-Rate"] = str(sample_rate)
    if reference.duration_seconds is not None:
        headers["X-Ref-Duration-Seconds"] = f"{reference.duration_seconds:.3f}"
    if voice.fallback_mode:
        headers["X-Voice-Fallback"] = voice.fallback_reason or "true"
    if synthesis.request_id:
        headers["X-Dashscope-Request-Id"] = synthesis.request_id

    return Response(
        content=data,
        media_type=content_type if content_type.startswith("audio/") else "audio/wav",
        headers=headers,
    )

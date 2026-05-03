from __future__ import annotations

import io
import time
from typing import Annotated

import numpy as np
import soundfile as sf
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response

from ..config import settings

router = APIRouter()

SUPPORTED_LANGUAGES = {"English", "Chinese"}


@router.post(
    "/clone",
    responses={200: {"content": {"audio/wav": {}}}},
    response_class=Response,
)
async def clone(
    request: Request,
    ref_audio: Annotated[UploadFile, File(description="Reference voice sample (WAV/MP3)")],
    ref_text: Annotated[str, Form(description="Transcript of the reference audio")],
    text: Annotated[str, Form(description="Target text to synthesize")],
    language: Annotated[str, Form(description="English or Chinese")] = "English",
) -> Response:
    if language not in SUPPORTED_LANGUAGES:
        raise HTTPException(400, f"language must be one of {sorted(SUPPORTED_LANGUAGES)}")
    if not ref_text.strip():
        raise HTTPException(400, "ref_text required (transcript of the reference audio)")
    if not text.strip():
        raise HTTPException(400, "text required")

    raw = await ref_audio.read()
    try:
        audio, sr = sf.read(io.BytesIO(raw), dtype="float32", always_2d=False)
    except Exception as e:
        raise HTTPException(400, f"could not decode ref_audio: {e}") from e

    if audio.ndim == 2:
        audio = audio.mean(axis=1)
    duration = len(audio) / sr
    if duration < settings.min_ref_seconds:
        raise HTTPException(
            400, f"ref_audio too short: {duration:.1f}s < {settings.min_ref_seconds}s"
        )
    if duration > settings.max_ref_seconds:
        raise HTTPException(
            400, f"ref_audio too long: {duration:.1f}s > {settings.max_ref_seconds}s"
        )

    runner = request.app.state.runner
    started = time.perf_counter()
    try:
        result = runner.clone(
            text=text,
            language=language,
            ref_audio=(audio, int(sr)),
            ref_text=ref_text,
        )
    except Exception as e:
        raise HTTPException(500, f"inference failed: {e}") from e
    elapsed = time.perf_counter() - started

    out = io.BytesIO()
    sf.write(out, np.asarray(result.audio), result.sample_rate, format="WAV", subtype="PCM_16")
    out.seek(0)

    return Response(
        content=out.getvalue(),
        media_type="audio/wav",
        headers={
            "X-Sample-Rate": str(result.sample_rate),
            "X-Elapsed-Seconds": f"{elapsed:.3f}",
            "X-Ref-Duration-Seconds": f"{duration:.3f}",
            "X-Language": language,
        },
    )

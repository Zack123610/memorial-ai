"""Reference-audio validation and encoding for the DashScope enrollment API."""

from __future__ import annotations

import base64
import hashlib
import io
import logging
from dataclasses import dataclass

import soundfile as sf

logger = logging.getLogger(__name__)

# DashScope accepts exactly these MIME types in the enrollment data URL, so
# everything we take in is normalized onto one of them.
_MIME_ALIASES = {
    "audio/wav": "audio/wav",
    "audio/wave": "audio/wav",
    "audio/x-wav": "audio/wav",
    "audio/vnd.wave": "audio/wav",
    "audio/mpeg": "audio/mpeg",
    "audio/mp3": "audio/mpeg",
    "audio/x-mp3": "audio/mpeg",
    "audio/mp4": "audio/mp4",
    "audio/m4a": "audio/mp4",
    "audio/x-m4a": "audio/mp4",
    "audio/aac": "audio/mp4",
}

_EXTENSION_MIMES = {
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".mp4": "audio/mp4",
    ".aac": "audio/mp4",
}

SUPPORTED_MIMES = sorted(set(_MIME_ALIASES.values()))


@dataclass(frozen=True)
class RefAudio:
    data: bytes
    mime: str
    # None when the container could not be decoded locally; DashScope still
    # validates length server-side.
    duration_seconds: float | None
    sample_rate: int | None

    @property
    def digest(self) -> str:
        return hashlib.sha256(self.data).hexdigest()

    def to_data_uri(self) -> str:
        encoded = base64.b64encode(self.data).decode()
        return f"data:{self.mime};base64,{encoded}"


class RefAudioError(ValueError):
    """Raised when the reference sample cannot be used for cloning."""


def normalize_mime(content_type: str | None, filename: str | None) -> str | None:
    """Map an upload's declared type (or its extension) onto a DashScope MIME."""
    if content_type:
        base = content_type.split(";")[0].strip().lower()
        if base in _MIME_ALIASES:
            return _MIME_ALIASES[base]
    if filename and "." in filename:
        ext = filename[filename.rfind(".") :].lower()
        return _EXTENSION_MIMES.get(ext)
    return None


def probe(data: bytes) -> tuple[float | None, int | None]:
    """Best-effort duration + sample rate. Returns ``(None, None)`` if undecodable.

    libsndfile handles WAV natively but not every MP3/M4A build, so a failure
    here is not fatal — it only means we skip the local length check.
    """
    try:
        info = sf.info(io.BytesIO(data))
    except Exception as exc:  # noqa: BLE001 - probing is advisory only
        logger.debug("could not probe reference audio: %s", exc)
        return None, None
    return float(info.duration), int(info.samplerate)


def prepare(
    data: bytes,
    *,
    content_type: str | None,
    filename: str | None,
    max_bytes: int,
    min_seconds: float,
    max_seconds: float,
) -> RefAudio:
    """Validate an uploaded sample and wrap it for enrollment."""
    if not data:
        raise RefAudioError("ref_audio is empty")

    mime = normalize_mime(content_type, filename)
    if mime is None:
        got = content_type or filename or "unknown"
        raise RefAudioError(
            f"unsupported ref_audio type '{got}'; expected one of {SUPPORTED_MIMES}"
        )

    if len(data) > max_bytes:
        raise RefAudioError(
            f"ref_audio is {len(data) / 1_048_576:.1f}MB, "
            f"over the {max_bytes / 1_048_576:.1f}MB limit"
        )

    duration, sample_rate = probe(data)
    if duration is not None:
        if duration < min_seconds:
            raise RefAudioError(f"ref_audio too short: {duration:.1f}s < {min_seconds}s")
        if duration > max_seconds:
            raise RefAudioError(f"ref_audio too long: {duration:.1f}s > {max_seconds}s")

    return RefAudio(data=data, mime=mime, duration_seconds=duration, sample_rate=sample_rate)

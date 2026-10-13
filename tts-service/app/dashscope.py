"""Async DashScope client for Qwen-Audio-TTS voice cloning + synthesis.

Two DashScope APIs are involved:

    POST /api/v1/services/audio/tts/customization
        model=voice-enrollment — clone a voice from reference audio
        (action=create_voice), returns a voice_id bound to a target TTS model.

    POST /api/v1/services/audio/tts/SpeechSynthesizer
        model=<target model> — synthesize text with that voice, returns a
        temporary URL to the rendered audio.

The qwen3-tts-vc-* family this service previously used was retired on
2026-10-10; cloning now goes through voice-enrollment and the voice is bound
to qwen-audio-3.0-tts-flash in the same enrollment/synthesis pairing.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx

from .config import Settings

logger = logging.getLogger(__name__)

_CUSTOMIZATION_PATH = "/api/v1/services/audio/tts/customization"
_SYNTHESIS_PATH = "/api/v1/services/audio/tts/SpeechSynthesizer"


class DashScopeError(RuntimeError):
    """Raised when DashScope rejects a request or returns an unusable body."""


@dataclass(frozen=True)
class EnrolledVoice:
    name: str
    target_model: str
    # DashScope falls back to a lower-quality clone when the sample is poor or
    # does not match the transcript; worth surfacing rather than failing.
    fallback_mode: bool = False
    fallback_reason: str | None = None


@dataclass(frozen=True)
class Synthesis:
    audio_url: str
    request_id: str | None
    expires_at: int | None


class DashScopeTtsClient:
    def __init__(self, settings: Settings, client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._client = client
        self._base = settings.dashscope_base

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._settings.dashscope_api_key}",
            "Content-Type": "application/json",
        }

    async def _post(self, path: str, payload: dict) -> dict:
        r = await self._client.post(f"{self._base}{path}", headers=self._headers(), json=payload)
        if r.status_code >= 400:
            raise DashScopeError(f"{path} failed {r.status_code}: {r.text[:500]}")
        body = r.json()
        # DashScope also reports failures in-band with a 200 status.
        if body.get("code"):
            raise DashScopeError(f"{path} returned {body['code']}: {body.get('message', '')}")
        return body

    async def create_voice(
        self,
        *,
        audio_data_uri: str,
        language_code: str | None,
    ) -> EnrolledVoice:
        """Clone a voice from reference audio and return its DashScope handle."""
        payload: dict = {
            "model": self._settings.tts_enrollment_model,
            "input": {
                "action": "create_voice",
                "target_model": self._settings.tts_dashscope_model,
                "prefix": self._settings.tts_voice_prefix,
                # voice-enrollment accepts a public URL or a base64 data URI;
                # inline keeps the reference sample off the internet.
                "url": audio_data_uri,
            },
        }
        if language_code:
            payload["input"]["language_hints"] = [language_code]

        body = await self._post(_CUSTOMIZATION_PATH, payload)
        output = body.get("output", {})
        voice = output.get("voice_id") or output.get("voice")
        if not voice:
            raise DashScopeError(f"enrollment returned no voice: {body}")
        return EnrolledVoice(
            name=voice,
            target_model=output.get("target_model") or self._settings.tts_dashscope_model,
            fallback_mode=bool(output.get("fallback_mode")),
            fallback_reason=output.get("fallback_reason"),
        )

    async def delete_voice(self, voice: str) -> None:
        payload = {
            "model": self._settings.tts_enrollment_model,
            "input": {"action": "delete_voice", "voice_id": voice},
        }
        await self._post(_CUSTOMIZATION_PATH, payload)

    async def synthesize(self, *, text: str, voice: str, language_code: str | None) -> Synthesis:
        """Render ``text`` in ``voice``; the returned URL is short-lived (~24h)."""
        payload: dict = {
            "model": self._settings.tts_dashscope_model,
            "input": {
                "text": text,
                "voice": voice,
                "format": "wav",
                "sample_rate": 24000,
            },
        }
        if language_code:
            payload["input"]["language_hints"] = [language_code]

        body = await self._post(_SYNTHESIS_PATH, payload)
        audio = body.get("output", {}).get("audio", {})
        url = audio.get("url")
        if not url:
            raise DashScopeError(f"synthesis returned no audio url: {body}")
        return Synthesis(
            audio_url=url,
            request_id=body.get("request_id"),
            expires_at=audio.get("expires_at"),
        )

    async def fetch_audio(self, url: str) -> tuple[bytes, str]:
        """Download rendered audio, returning its bytes and content type."""
        r = await self._client.get(url)
        r.raise_for_status()
        content_type = r.headers.get("content-type", "").split(";")[0].strip()
        return r.content, content_type or "audio/wav"

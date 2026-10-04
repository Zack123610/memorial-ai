"""Service configuration, loaded from environment / .env.

Field names are case-insensitively matched to the env vars in .env.example
(e.g. ``tts_dashscope_model`` <- ``TTS_DASHSCOPE_MODEL``). ``DASHSCOPE_API_KEY``
is unprefixed so it can be shared with the sibling video-service.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- HTTP server ---
    tts_host: str = "127.0.0.1"
    tts_port: int = 8200

    # --- DashScope (Aliyun) Qwen3-TTS voice cloning ---
    dashscope_api_key: str = ""
    tts_dashscope_base: str = "https://dashscope.aliyuncs.com"
    # The enrollment API clones a voice; the TTS model then speaks with it.
    # The two are bound together: target_model at enrollment must equal the
    # model used for synthesis, or synthesis fails.
    tts_enrollment_model: str = "qwen-voice-enrollment"
    tts_dashscope_model: str = "qwen3-tts-vc-2026-01-22"
    # Keyword embedded in generated voice names (letters/digits/underscore, <=16 chars).
    tts_voice_prefix: str = "memorial"

    # --- Reference audio constraints ---
    # DashScope recommends 10-20s of clean mono speech, 60s max. The payload is
    # base64-encoded (~33% larger) and the encoded form must stay under 10 MB.
    tts_min_ref_seconds: float = 3.0
    tts_max_ref_seconds: float = 60.0
    tts_max_ref_bytes: int = 7 * 1024 * 1024
    # Send the reference transcript so DashScope can verify it matches the
    # audio. Disable if legitimate samples are rejected as mismatched.
    tts_send_ref_text: bool = True

    # --- Enrollment reuse ---
    # Cloning the same reference twice wastes a voice slot, so enrollments are
    # cached by reference-audio digest and reused until they expire.
    tts_voice_cache_ttl: float = 86_400.0
    tts_voice_cache_size: int = 128
    # DashScope caps how many voices an account may hold; drop ours on the way out.
    tts_delete_voices_on_shutdown: bool = True

    tts_request_timeout: float = 120.0
    storage_dir: Path = Path("storage")

    @property
    def dashscope_base(self) -> str:
        return self.tts_dashscope_base.rstrip("/")


@lru_cache
def get_settings() -> Settings:
    return Settings()

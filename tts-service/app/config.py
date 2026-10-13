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

    # --- DashScope (Aliyun) Qwen-Audio-TTS voice cloning ---
    dashscope_api_key: str = ""
    tts_dashscope_base: str = "https://dashscope.aliyuncs.com"
    # The voice-enrollment service clones a voice; the TTS model then speaks
    # with it. The two are bound together: target_model at enrollment must
    # equal the model used for synthesis, or synthesis fails.
    tts_enrollment_model: str = "voice-enrollment"
    tts_dashscope_model: str = "qwen-audio-3.0-tts-flash"
    # Keyword embedded in generated voice IDs (letters/digits/underscore).
    tts_voice_prefix: str = "memorial"

    # --- Reference audio constraints ---
    # Qwen-Audio-TTS requires at least 5s of continuous clear speech,
    # recommends 10-20s, and caps the sample at 60s / 10 MB. The payload is
    # base64-encoded (~33% larger), so the raw upload is capped below that.
    tts_min_ref_seconds: float = 5.0
    tts_max_ref_seconds: float = 60.0
    tts_max_ref_bytes: int = 7 * 1024 * 1024

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

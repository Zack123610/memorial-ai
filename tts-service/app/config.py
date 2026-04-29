from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="TTS_", extra="ignore")

    host: str = "127.0.0.1"
    port: int = 8200

    model_id: str = "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"
    device: str = "auto"
    dtype: str = "float16"
    eager_load: bool = False

    storage_dir: Path = Path("storage")
    max_ref_seconds: float = 60.0
    min_ref_seconds: float = 3.0


settings = Settings()

"""Service configuration, loaded from environment / .env.

Field names are case-insensitively matched to the env vars in .env.example
(e.g. ``video_dashscope_base`` <- ``VIDEO_DASHSCOPE_BASE``).
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- HTTP server ---
    video_host: str = "127.0.0.1"
    video_port: int = 8300

    # --- DashScope (Aliyun) Wan2.7 i2v ---
    dashscope_api_key: str = ""
    video_dashscope_base: str = "https://dashscope.aliyuncs.com"
    video_dashscope_model: str = "wan2.7-i2v-2026-04-25"

    # --- Generation defaults (overridable per request) ---
    video_default_resolution: str = "720P"
    video_default_duration: int = 5
    video_default_prompt_extend: bool = True
    video_default_watermark: bool = False

    # --- Async task polling ---
    video_task_timeout: float = 900.0
    video_poll_interval: float = 5.0

    # --- S3 (input hosting + output archival) ---
    s3_bucket: str = "img-web-req"
    s3_region: str = "ap-southeast-1"
    # Where uploaded inputs / generated outputs are stored within the bucket.
    s3_input_prefix: str = "memorial/inputs"
    s3_output_prefix: str = "memorial/outputs"
    # Public base used to build URLs handed to DashScope. Defaults to the
    # virtual-hosted bucket endpoint; override if served via CDN/custom domain.
    s3_public_base: str = ""
    # Credentials: leave blank to use the default AWS credential chain
    # (env, shared config, instance role).
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""

    @property
    def public_base(self) -> str:
        if self.s3_public_base:
            return self.s3_public_base.rstrip("/")
        return f"https://{self.s3_bucket}.s3.{self.s3_region}.amazonaws.com"


@lru_cache
def get_settings() -> Settings:
    return Settings()

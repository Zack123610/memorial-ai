"""S3 storage: host uploaded inputs and archive generated outputs.

boto3 is synchronous, so callers should invoke these helpers via
``asyncio.to_thread`` from async code.
"""

from __future__ import annotations

import boto3
from botocore.config import Config as BotoConfig

from .config import Settings


class S3Storage:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        kwargs: dict = {
            "region_name": settings.s3_region,
            "config": BotoConfig(retries={"max_attempts": 3}),
        }
        if settings.aws_access_key_id and settings.aws_secret_access_key:
            kwargs["aws_access_key_id"] = settings.aws_access_key_id
            kwargs["aws_secret_access_key"] = settings.aws_secret_access_key
        self._client = boto3.client("s3", **kwargs)

    def _url(self, key: str) -> str:
        return f"{self._settings.public_base}/{key}"

    def put_bytes(self, data: bytes, key: str, content_type: str) -> str:
        """Upload raw bytes to ``key`` and return its public URL."""
        self._client.put_object(
            Bucket=self._settings.s3_bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
        return self._url(key)

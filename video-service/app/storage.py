"""S3 storage: host uploaded inputs and archive generated outputs.

Objects are private. DashScope needs a URL it can fetch, so inputs are handed
out as short-lived presigned GETs rather than being made world-readable — these
are portraits and voice recordings of the deceased, and a public object key
would be readable by anyone forever.

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
            # SigV4 is required for presigned URLs to be valid in every region,
            # and by R2.
            "config": BotoConfig(retries={"max_attempts": 3}, signature_version="s3v4"),
        }
        # Set to point at an S3-compatible service such as Cloudflare R2.
        if settings.s3_endpoint_url:
            kwargs["endpoint_url"] = settings.s3_endpoint_url
        if settings.aws_access_key_id and settings.aws_secret_access_key:
            kwargs["aws_access_key_id"] = settings.aws_access_key_id
            kwargs["aws_secret_access_key"] = settings.aws_secret_access_key
        self._client = boto3.client("s3", **kwargs)

    def put_bytes(self, data: bytes, key: str, content_type: str) -> str:
        """Upload raw bytes to ``key`` and return the key."""
        self._client.put_object(
            Bucket=self._settings.s3_bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
        return key

    def url_for(self, key: str, *, ttl: int) -> str:
        """A fetchable URL for ``key``, valid for ``ttl`` seconds.

        Falls back to a plain public URL when presigning is turned off, which is
        what you want behind a CDN or an R2 bucket on a custom domain.
        """
        if not self._settings.s3_presign:
            return f"{self._settings.public_base}/{key}"
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._settings.s3_bucket, "Key": key},
            ExpiresIn=ttl,
        )

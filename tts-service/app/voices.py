"""Cache of DashScope voice enrollments.

Cloning is a separate, quota-limited DashScope call, so the same reference
sample should not be enrolled twice. Entries are keyed by a digest of the
reference audio (plus the transcript and language that were sent with it) and
expire after ``TTS_VOICE_CACHE_TTL``.

The cache lives in process memory: restarting the service forgets the voices,
which is why enrollments are deleted on shutdown rather than left orphaned in
the DashScope account.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import time
from collections import OrderedDict
from dataclasses import dataclass

from .config import Settings
from .dashscope import DashScopeTtsClient, EnrolledVoice

logger = logging.getLogger(__name__)


@dataclass
class CachedVoice:
    voice: EnrolledVoice
    created_at: float


class VoiceRegistry:
    def __init__(self, settings: Settings, client: DashScopeTtsClient) -> None:
        self._settings = settings
        self._client = client
        self._entries: OrderedDict[str, CachedVoice] = OrderedDict()
        # Per-key locks so concurrent requests with the same sample enroll once.
        self._locks: dict[str, asyncio.Lock] = {}
        self._cleanup: set[asyncio.Task] = set()

    @property
    def size(self) -> int:
        return len(self._entries)

    @staticmethod
    def key(
        *, audio_digest: str, target_model: str, language_code: str | None, ref_text: str
    ) -> str:
        raw = "|".join([audio_digest, target_model, language_code or "-", ref_text])
        return hashlib.sha256(raw.encode()).hexdigest()

    async def get_or_create(
        self,
        *,
        cache_key: str,
        audio_data_uri: str,
        language_code: str | None,
        ref_text: str | None,
    ) -> tuple[EnrolledVoice, bool]:
        """Return the voice for ``cache_key`` and whether it came from the cache."""
        lock = self._locks.setdefault(cache_key, asyncio.Lock())
        async with lock:
            cached = self._live(cache_key)
            if cached is not None:
                self._entries.move_to_end(cache_key)
                return cached.voice, True

            voice = await self._client.create_voice(
                audio_data_uri=audio_data_uri,
                language_code=language_code,
                ref_text=ref_text,
            )
            if voice.fallback_mode:
                logger.warning(
                    "voice %s cloned in fallback mode (%s) — quality may be degraded",
                    voice.name,
                    voice.fallback_reason or "unspecified",
                )
            self._entries[cache_key] = CachedVoice(voice=voice, created_at=time.time())
            self._entries.move_to_end(cache_key)
            self._evict_overflow()
            return voice, False

    async def shutdown(self) -> None:
        entries = list(self._entries.values())
        self._entries.clear()
        self._locks.clear()
        if self._cleanup:
            await asyncio.gather(*list(self._cleanup), return_exceptions=True)
        if not self._settings.tts_delete_voices_on_shutdown:
            return
        for entry in entries:
            await self._delete(entry.voice.name)

    # --- internals ---

    def _live(self, cache_key: str) -> CachedVoice | None:
        entry = self._entries.get(cache_key)
        if entry is None:
            return None
        if time.time() - entry.created_at > self._settings.tts_voice_cache_ttl:
            # Expired entries are dropped lazily; the remote voice is cleaned up
            # in the background so the caller is not blocked by it.
            self._entries.pop(cache_key, None)
            self._schedule_delete(entry.voice.name)
            return None
        return entry

    def _evict_overflow(self) -> None:
        while len(self._entries) > self._settings.tts_voice_cache_size:
            key, entry = self._entries.popitem(last=False)
            self._locks.pop(key, None)
            self._schedule_delete(entry.voice.name)

    def _schedule_delete(self, voice: str) -> None:
        task = asyncio.create_task(self._delete(voice))
        self._cleanup.add(task)
        task.add_done_callback(self._cleanup.discard)

    async def _delete(self, voice: str) -> None:
        try:
            await self._client.delete_voice(voice)
        except Exception as exc:  # noqa: BLE001 - cleanup must never break a request
            logger.warning("failed to delete voice %s: %s", voice, exc)

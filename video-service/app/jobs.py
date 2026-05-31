"""In-memory job store and the async worker that drives the pipeline.

Pipeline per job:
    1. upload image (+ optional audio) to S3            -> public URLs
    2. submit DashScope async job                       -> task_id
    3. poll DashScope until SUCCEEDED / FAILED
    4. download the result and re-upload to S3          -> archived video_url

Jobs live in process memory only; restarting the service drops them. A
durable queue (BullMQ/Redis per the project README) is a later phase.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field

import httpx

from .config import Settings
from .dashscope import DashScopeClient, DashScopeError
from .schemas import JobStatus
from .storage import S3Storage

_TERMINAL_DASHSCOPE = {"FAILED", "CANCELED", "UNKNOWN"}


@dataclass
class Job:
    id: str
    prompt: str
    resolution: str
    duration: int
    prompt_extend: bool
    watermark: bool
    status: JobStatus = JobStatus.queued
    detail: str | None = "queued"
    image_url: str | None = None
    audio_url: str | None = None
    video_url: str | None = None
    error: str | None = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def touch(self) -> None:
        self.updated_at = time.time()


@dataclass
class _Upload:
    data: bytes
    content_type: str
    ext: str


class JobManager:
    """Holds jobs and spawns one worker task per submission."""

    def __init__(
        self,
        settings: Settings,
        dashscope: DashScopeClient,
        storage: S3Storage,
        http: httpx.AsyncClient,
    ) -> None:
        self._settings = settings
        self._dashscope = dashscope
        self._storage = storage
        self._http = http
        self._jobs: dict[str, Job] = {}
        self._tasks: set[asyncio.Task] = set()

    def get(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    def submit(
        self,
        *,
        prompt: str,
        resolution: str,
        duration: int,
        prompt_extend: bool,
        watermark: bool,
        image: _Upload,
        audio: _Upload | None,
    ) -> Job:
        job = Job(
            id=uuid.uuid4().hex,
            prompt=prompt,
            resolution=resolution,
            duration=duration,
            prompt_extend=prompt_extend,
            watermark=watermark,
        )
        self._jobs[job.id] = job
        task = asyncio.create_task(self._run(job, image, audio))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return job

    async def shutdown(self) -> None:
        for task in list(self._tasks):
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)

    # --- internals ---

    def _set(self, job: Job, status: JobStatus, detail: str | None) -> None:
        job.status = status
        job.detail = detail
        job.touch()

    def _key(self, prefix: str, job_id: str, name: str) -> str:
        return f"{prefix.strip('/')}/{job_id}/{name}"

    async def _run(self, job: Job, image: _Upload, audio: _Upload | None) -> None:
        try:
            await self._pipeline(job, image, audio)
        except asyncio.CancelledError:
            raise
        except DashScopeError as exc:
            self._fail(job, str(exc))
        except Exception as exc:  # noqa: BLE001 - surface any failure to the caller
            self._fail(job, f"{type(exc).__name__}: {exc}")

    def _fail(self, job: Job, message: str) -> None:
        job.error = message
        self._set(job, JobStatus.failed, "failed")

    async def _pipeline(self, job: Job, image: _Upload, audio: _Upload | None) -> None:
        s = self._settings

        # 1. upload inputs to S3
        self._set(job, JobStatus.processing, "uploading inputs")
        in_prefix = s.s3_input_prefix
        job.image_url = await asyncio.to_thread(
            self._storage.put_bytes,
            image.data,
            self._key(in_prefix, job.id, f"image{image.ext}"),
            image.content_type,
        )
        if audio is not None:
            job.audio_url = await asyncio.to_thread(
                self._storage.put_bytes,
                audio.data,
                self._key(in_prefix, job.id, f"audio{audio.ext}"),
                audio.content_type,
            )
        job.touch()

        # 2. submit DashScope job
        self._set(job, JobStatus.processing, "submitting to dashscope")
        task_id = await self._dashscope.submit_job(
            prompt=job.prompt,
            image_url=job.image_url,
            audio_url=job.audio_url,
            resolution=job.resolution,
            duration=job.duration,
            prompt_extend=job.prompt_extend,
            watermark=job.watermark,
        )

        # 3. poll until terminal
        video_url = await self._poll(job, task_id)

        # 4. archive the result to S3
        self._set(job, JobStatus.processing, "archiving output")
        archived = await self._archive(job, video_url)
        job.video_url = archived
        self._set(job, JobStatus.succeeded, "succeeded")

    async def _poll(self, job: Job, task_id: str) -> str:
        s = self._settings
        deadline = time.monotonic() + s.video_task_timeout
        last: str | None = None
        while True:
            body = await self._dashscope.get_task(task_id)
            output = body.get("output", {})
            status = output.get("task_status")
            if status != last:
                self._set(job, JobStatus.processing, f"dashscope: {status}")
                last = status
            if status == "SUCCEEDED":
                video_url = output.get("video_url")
                if not video_url:
                    raise DashScopeError(f"task {task_id} succeeded but no video_url: {body}")
                return video_url
            if status in _TERMINAL_DASHSCOPE:
                raise DashScopeError(f"task {task_id} ended with {status}: {body}")
            if time.monotonic() > deadline:
                raise TimeoutError(
                    f"task {task_id} did not finish within {s.video_task_timeout:.0f}s"
                )
            await asyncio.sleep(s.video_poll_interval)

    async def _archive(self, job: Job, video_url: str) -> str:
        """Download the DashScope result and re-upload it to our S3 bucket.

        DashScope-hosted URLs expire; archiving gives callers a stable URL.
        """
        r = await self._http.get(video_url)
        r.raise_for_status()
        key = self._key(self._settings.s3_output_prefix, job.id, "video.mp4")
        return await asyncio.to_thread(self._storage.put_bytes, r.content, key, "video/mp4")

import { config } from '../config/env.js';

export type VideoJobStatus = 'queued' | 'processing' | 'succeeded' | 'failed';

export interface VideoSubmitInput {
  image: Buffer;
  imageFilename?: string;
  imageMimeType?: string;
  audio?: Buffer;
  audioFilename?: string;
  audioMimeType?: string;
  prompt: string;
}

export interface VideoJob {
  jobId: string;
  status: VideoJobStatus;
  detail: string | null;
  videoUrl: string | null;
  error: string | null;
}

export class VideoServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'VideoServiceError';
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Client for the video-service job API (DashScope Wan2.7 i2v). */
export class VideoClient {
  constructor(
    private readonly baseUrl: string = config.videoServiceUrl,
    private readonly pollIntervalMs = 5_000,
    private readonly timeoutMs = 15 * 60_000,
  ) {}

  async submit(input: VideoSubmitInput): Promise<{ jobId: string }> {
    const form = new FormData();
    form.append(
      'image',
      new Blob([input.image], { type: input.imageMimeType ?? 'image/jpeg' }),
      input.imageFilename ?? 'image.jpg',
    );
    if (input.audio) {
      form.append(
        'audio',
        new Blob([input.audio], { type: input.audioMimeType ?? 'audio/wav' }),
        input.audioFilename ?? 'audio.wav',
      );
    }
    form.append('prompt', input.prompt);

    const res = await fetch(`${this.baseUrl}/api/v1/jobs`, { method: 'POST', body: form });
    if (!res.ok) {
      const detail = await res.text().catch(() => '<no body>');
      throw new VideoServiceError(`video-service ${res.status}: ${detail}`, res.status);
    }
    const json = (await res.json()) as { job_id: string };
    return { jobId: json.job_id };
  }

  async getStatus(jobId: string): Promise<VideoJob> {
    const res = await fetch(`${this.baseUrl}/api/v1/jobs/${jobId}`);
    if (!res.ok) {
      const detail = await res.text().catch(() => '<no body>');
      throw new VideoServiceError(`video-service ${res.status}: ${detail}`, res.status);
    }
    const j = (await res.json()) as {
      job_id: string;
      status: VideoJobStatus;
      detail?: string | null;
      video_url?: string | null;
      error?: string | null;
    };
    return {
      jobId: j.job_id,
      status: j.status,
      detail: j.detail ?? null,
      videoUrl: j.video_url ?? null,
      error: j.error ?? null,
    };
  }

  /** Poll the video-service job until it succeeds or fails. */
  async waitForCompletion(
    jobId: string,
    onProgress?: (detail: string) => void,
  ): Promise<{ videoUrl: string }> {
    const deadline = Date.now() + this.timeoutMs;
    for (;;) {
      const job = await this.getStatus(jobId);
      onProgress?.(job.detail ?? `video: ${job.status}`);

      if (job.status === 'succeeded') {
        if (!job.videoUrl) {
          throw new VideoServiceError('video-service succeeded without a video_url', 502);
        }
        return { videoUrl: job.videoUrl };
      }
      if (job.status === 'failed') {
        throw new VideoServiceError(job.error ?? 'video-service job failed', 502);
      }
      if (Date.now() > deadline) {
        throw new VideoServiceError('Timed out waiting for video-service', 504);
      }
      await delay(this.pollIntervalMs);
    }
  }
}

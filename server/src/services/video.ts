import { config } from '../config/env.js';
import { fetchWithTimeout, withRetry } from '../lib/fetch.js';

export type VideoJobStatus = 'queued' | 'processing' | 'succeeded' | 'failed';

export interface VideoSubmitInput {
  image: Buffer;
  imageFilename?: string;
  imageMimeType?: string;
  audio?: Buffer;
  audioFilename?: string;
  audioMimeType?: string;
  prompt: string;
  resolution?: string;
  duration?: number;
  promptExtend?: boolean;
  watermark?: boolean;
}

export interface VideoJob {
  jobId: string;
  status: VideoJobStatus;
  detail: string | null;
  videoUrl: string | null;
  error: string | null;
}

export interface VideoHealth {
  status: string;
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
    private readonly pollIntervalMs = config.http.videoPollIntervalMs,
    private readonly waitTimeoutMs = config.http.videoWaitTimeoutMs,
    private readonly requestTimeoutMs = config.http.videoTimeoutMs,
    private readonly retries = config.http.maxRetries,
  ) {}

  async health(): Promise<VideoHealth> {
    const res = await fetchWithTimeout(
      `${this.baseUrl}/api/v1/health`,
      {},
      config.http.healthTimeoutMs,
    );
    if (!res.ok) throw new VideoServiceError(await res.text(), res.status);
    return (await res.json()) as VideoHealth;
  }

  async submit(input: VideoSubmitInput): Promise<{ jobId: string }> {
    return withRetry(() => this.submitOnce(input), {
      retries: this.retries,
      label: 'video.submit',
    });
  }

  private async submitOnce(input: VideoSubmitInput): Promise<{ jobId: string }> {
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
    if (input.resolution) form.append('resolution', input.resolution);
    if (input.duration !== undefined) form.append('duration', String(input.duration));
    if (input.promptExtend !== undefined) {
      form.append('prompt_extend', String(input.promptExtend));
    }
    if (input.watermark !== undefined) form.append('watermark', String(input.watermark));

    let res: Response;
    try {
      res = await fetchWithTimeout(
        `${this.baseUrl}/api/v1/jobs`,
        { method: 'POST', body: form },
        this.requestTimeoutMs,
      );
    } catch (err) {
      throw new VideoServiceError(
        err instanceof Error ? err.message : 'video-service request failed',
        504,
      );
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '<no body>');
      throw new VideoServiceError(`video-service ${res.status}: ${detail}`, res.status);
    }
    const json = (await res.json()) as { job_id: string };
    return { jobId: json.job_id };
  }

  async getStatus(jobId: string): Promise<VideoJob> {
    let res: Response;
    try {
      res = await fetchWithTimeout(
        `${this.baseUrl}/api/v1/jobs/${jobId}`,
        {},
        this.requestTimeoutMs,
      );
    } catch (err) {
      throw new VideoServiceError(
        err instanceof Error ? err.message : 'video-service status request failed',
        504,
      );
    }
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
    const deadline = Date.now() + this.waitTimeoutMs;
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

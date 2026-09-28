function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: num(process.env.PORT, 3001),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  ttsServiceUrl: process.env.TTS_SERVICE_URL ?? 'http://localhost:8200',
  videoServiceUrl: process.env.VIDEO_SERVICE_URL ?? 'http://localhost:8300',
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: num(process.env.REDIS_PORT, 6379),
  },
  storageDir: process.env.STORAGE_DIR ?? './storage',
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  maxUploadMb: num(process.env.MAX_UPLOAD_MB, 50),

  /** Input limits enforced before the pipeline starts. */
  limits: {
    maxTextChars: num(process.env.MAX_TEXT_CHARS, 800),
    maxRefTextChars: num(process.env.MAX_REF_TEXT_CHARS, 500),
    minAudioSeconds: num(process.env.MIN_AUDIO_SECONDS, 3),
    maxAudioSeconds: num(process.env.MAX_AUDIO_SECONDS, 60),
  },

  /** Video-service knobs forwarded on submit. */
  video: {
    resolution: process.env.VIDEO_RESOLUTION ?? '720P',
    /** Fallback when cloned-audio duration cannot be measured. */
    defaultDuration: num(process.env.VIDEO_DURATION, 5),
    minDuration: num(process.env.VIDEO_DURATION_MIN, 5),
    maxDuration: num(process.env.VIDEO_DURATION_MAX, 10),
    promptExtend: (process.env.VIDEO_PROMPT_EXTEND ?? 'true').toLowerCase() !== 'false',
    watermark: (process.env.VIDEO_WATERMARK ?? 'false').toLowerCase() === 'true',
  },

  /** Downstream HTTP behaviour. */
  http: {
    ttsTimeoutMs: num(process.env.TTS_TIMEOUT_MS, 120_000),
    videoTimeoutMs: num(process.env.VIDEO_TIMEOUT_MS, 60_000),
    videoPollIntervalMs: num(process.env.VIDEO_POLL_INTERVAL_MS, 5_000),
    videoWaitTimeoutMs: num(process.env.VIDEO_WAIT_TIMEOUT_MS, 15 * 60_000),
    healthTimeoutMs: num(process.env.HEALTH_TIMEOUT_MS, 3_000),
    maxRetries: num(process.env.DOWNSTREAM_RETRIES, 1),
  },
};

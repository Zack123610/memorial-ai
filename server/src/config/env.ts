function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true';
}

/** Comma-separated env var -> trimmed, non-empty entries. */
function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Wan i2v refuses a `duration` above this, so neither may VIDEO_DURATION_MAX. */
const MODEL_MAX_DURATION = 15;

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

  /**
   * Browser origins allowed to call the API. Empty means same-origin only,
   * which is the right default: the deployed client is served from a separate
   * Cloudflare Pages hostname and must be named explicitly.
   */
  corsOrigins: list(process.env.CORS_ORIGINS),

  /**
   * Cloudflare Access in front of the tunnel. The signed `Cf-Access-Jwt-
   * Assertion` header is verified against the team's JWKS, so a request that
   * reaches the origin by any other path is still rejected.
   */
  access: {
    teamDomain: (process.env.CF_ACCESS_TEAM_DOMAIN ?? '').replace(/^https?:\/\//, ''),
    audience: process.env.CF_ACCESS_AUD ?? '',
    required: bool(process.env.CF_ACCESS_REQUIRED, false),
  },

  /** How long a finished job stays readable before Redis evicts it. */
  jobTtlSeconds: num(process.env.JOB_TTL_SECONDS, 7 * 24 * 60 * 60),

  /**
   * Generation quotas. Every accepted job spends real DashScope credit, so the
   * global daily cap is a spend ceiling, not just abuse protection.
   */
  quota: {
    perUserPerHour: num(process.env.QUOTA_USER_HOUR, 5),
    perUserPerDay: num(process.env.QUOTA_USER_DAY, 10),
    globalPerDay: num(process.env.QUOTA_GLOBAL_DAY, 25),
  },

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
    maxDuration: Math.min(
      num(process.env.VIDEO_DURATION_MAX, MODEL_MAX_DURATION),
      MODEL_MAX_DURATION,
    ),
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

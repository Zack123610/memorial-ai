import { Router } from 'express';
import { config } from '../config/env.js';
import { estimateSpeechSeconds, textBudgetFor } from '../lib/audio.js';
import { uploadJobFiles } from '../middleware/upload.js';
import { runPipeline, type PipelineDeps } from '../jobs/pipeline.js';
import { callerId, type JobQuota } from '../jobs/quota.js';
import type { TtsLanguage } from '../services/tts.js';

interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

export interface JobsRouterDeps extends PipelineDeps {
  quota: JobQuota;
}

function trimRequired(value: unknown, field: string): string | { error: string } {
  if (typeof value !== 'string' || !value.trim()) {
    return { error: `${field} is required` };
  }
  return value.trim();
}

export function createJobsRouter(deps: JobsRouterDeps): Router {
  const router = Router();

  // POST /api/jobs — multipart: image, audio, refText, text, language?
  router.post('/', uploadJobFiles, async (req, res) => {
    const files = req.files as Record<string, UploadedFile[]> | undefined;
    const image = files?.image?.[0];
    const audio = files?.audio?.[0];
    const body = (req.body ?? {}) as Record<string, string | undefined>;

    if (!image) return res.status(422).json({ error: 'image file is required' });
    if (!audio) return res.status(422).json({ error: 'audio file is required' });

    const refText = trimRequired(body.refText, 'refText');
    if (typeof refText !== 'string') return res.status(422).json(refText);

    const text = trimRequired(body.text, 'text');
    if (typeof text !== 'string') return res.status(422).json(text);

    if (refText.length > config.limits.maxRefTextChars) {
      return res.status(422).json({
        error: `refText must be at most ${config.limits.maxRefTextChars} characters`,
      });
    }
    const lang: TtsLanguage = body.language === 'Chinese' ? 'Chinese' : 'English';

    // The video is exactly as long as the cloned speech, and Wan i2v caps that.
    // Reject here rather than paying for TTS and truncating the sentence later.
    const speechSeconds = estimateSpeechSeconds(text, lang);
    const textBudget = Math.min(
      config.limits.maxTextChars,
      textBudgetFor(config.video.maxDuration, lang),
    );
    if (text.length > textBudget) {
      return res.status(422).json({
        error: `text is about ${Math.ceil(speechSeconds)}s of speech but the video can be at most ${config.video.maxDuration}s — keep it under ${textBudget} characters`,
      });
    }

    // Charged only once the input is known-good, so a typo does not cost the
    // caller an attempt. Everything past this point spends DashScope credit.
    const caller = callerId(req);
    const quota = await deps.quota.consume(caller);
    if (!quota.allowed) {
      if (quota.retryAfterSeconds) res.set('Retry-After', String(quota.retryAfterSeconds));
      return res.status(429).json({ error: quota.reason, code: 'QUOTA_EXCEEDED' });
    }

    let jobId: string;
    try {
      const job = await deps.store.create();
      jobId = job.id;
      res.status(202).json({ jobId: job.id, status: job.status });
    } catch (err) {
      await deps.quota.release(caller);
      console.error('[jobs] could not create job:', err);
      return res.status(503).json({ error: 'job storage is unavailable, try again shortly' });
    }

    void runPipeline(
      jobId,
      {
        image: { buffer: image.buffer, filename: image.originalname, mimetype: image.mimetype },
        audio: { buffer: audio.buffer, filename: audio.originalname, mimetype: audio.mimetype },
        refText,
        text,
        language: lang,
      },
      deps,
    );
  });

  // GET /api/jobs/:id — status + result video_url (when completed)
  router.get('/:id', async (req, res) => {
    const job = await deps.store.get(req.params.id).catch((err) => {
      console.error('[jobs] could not read job:', err);
      return undefined;
    });
    if (!job) {
      return res.status(404).json({
        error: 'job not found',
        code: 'JOB_EXPIRED',
        hint: `Jobs are kept for ${Math.round(config.jobTtlSeconds / 86_400)} days. Start a new farewell.`,
      });
    }
    res.json(job);
  });

  return router;
}

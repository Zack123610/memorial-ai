import { Router } from 'express';
import { config } from '../config/env.js';
import { estimateSpeechSeconds, textBudgetFor } from '../lib/audio.js';
import { uploadJobFiles } from '../middleware/upload.js';
import { runPipeline, type PipelineDeps } from '../jobs/pipeline.js';
import type { TtsLanguage } from '../services/tts.js';

interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

function trimRequired(value: unknown, field: string): string | { error: string } {
  if (typeof value !== 'string' || !value.trim()) {
    return { error: `${field} is required` };
  }
  return value.trim();
}

export function createJobsRouter(deps: PipelineDeps): Router {
  const router = Router();

  // POST /api/jobs — multipart: image, audio, refText, text, language?
  router.post('/', uploadJobFiles, (req, res) => {
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

    const job = deps.store.create();
    res.status(202).json({ jobId: job.id, status: job.status });

    void runPipeline(
      job.id,
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
  router.get('/:id', (req, res) => {
    const job = deps.store.get(req.params.id);
    if (!job) {
      // In-memory store: jobs vanish on restart. Tell the client explicitly.
      return res.status(404).json({
        error: 'job not found',
        code: 'JOB_EXPIRED',
        hint: 'Jobs are kept in memory and are lost if the server restarts. Start a new farewell.',
      });
    }
    res.json(job);
  });

  return router;
}

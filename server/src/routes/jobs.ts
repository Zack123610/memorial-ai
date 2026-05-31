import { Router } from 'express';
import { uploadJobFiles } from '../middleware/upload.js';
import { runPipeline, type PipelineDeps } from '../jobs/pipeline.js';
import type { TtsLanguage } from '../services/tts.js';

interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

export function createJobsRouter(deps: PipelineDeps): Router {
  const router = Router();

  // POST /api/jobs — multipart: image, audio, refText, text, language?
  router.post('/', uploadJobFiles, (req, res) => {
    const files = req.files as Record<string, UploadedFile[]> | undefined;
    const image = files?.image?.[0];
    const audio = files?.audio?.[0];
    const { refText, text, language } = (req.body ?? {}) as Record<string, string | undefined>;

    if (!image) return res.status(422).json({ error: 'image file is required' });
    if (!audio) return res.status(422).json({ error: 'audio file is required' });
    if (!refText) return res.status(422).json({ error: 'refText is required' });
    if (!text) return res.status(422).json({ error: 'text is required' });

    const lang: TtsLanguage = language === 'Chinese' ? 'Chinese' : 'English';
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
    if (!job) return res.status(404).json({ error: 'job not found' });
    res.json(job);
  });

  return router;
}

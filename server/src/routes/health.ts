import { Router } from 'express';
import type { TtsClient } from '../services/tts.js';
import type { VideoClient } from '../services/video.js';

export interface HealthDeps {
  tts: TtsClient;
  video: VideoClient;
}

type DownstreamStatus = 'ok' | 'degraded' | 'down';

async function probe(
  label: string,
  fn: () => Promise<unknown>,
): Promise<{ status: DownstreamStatus; detail?: string }> {
  try {
    await fn();
    return { status: 'ok' };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(`[health] ${label} probe failed:`, detail);
    return { status: 'down', detail };
  }
}

export function createHealthRouter(deps: HealthDeps): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const [tts, video] = await Promise.all([
      probe('tts', () => deps.tts.health()),
      probe('video', () => deps.video.health()),
    ]);

    const downstream = { tts, video };
    const allOk = tts.status === 'ok' && video.status === 'ok';
    const status: DownstreamStatus = allOk ? 'ok' : 'degraded';

    res.status(allOk ? 200 : 503).json({
      status,
      service: 'memorial-ai-server',
      timestamp: new Date().toISOString(),
      downstream,
    });
  });

  return router;
}

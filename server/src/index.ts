import 'dotenv/config';
import http from 'node:http';
import express, { type ErrorRequestHandler } from 'express';
import cors, { type CorsOptions } from 'cors';
import multer from 'multer';
import { Redis } from 'ioredis';
import { Server as SocketServer } from 'socket.io';
import { config } from './config/env.js';
import { createHealthRouter } from './routes/health.js';
import { createJobsRouter } from './routes/jobs.js';
import { JobStore } from './jobs/store.js';
import { JobQuota } from './jobs/quota.js';
import { resumePipeline, type PipelineDeps } from './jobs/pipeline.js';
import { createAccessGuard, verifyAccessToken, cookieToken } from './middleware/access.js';
import { TtsClient } from './services/tts.js';
import { VideoClient } from './services/video.js';

const app = express();

/**
 * Cloudflare Tunnel is the only ingress in production, so the proxy chain is
 * trusted and `req.ip` reflects the real client.
 */
app.set('trust proxy', true);

/**
 * In production the client is served from a different hostname (Cloudflare
 * Pages), so its origin must be named explicitly. Credentials are required
 * because the browser has to send the Cloudflare Access cookie cross-origin.
 */
const corsOptions: CorsOptions =
  config.corsOrigins.length > 0
    ? { origin: config.corsOrigins, credentials: true }
    : { origin: true, credentials: true };

if (config.corsOrigins.length === 0 && config.nodeEnv === 'production') {
  console.warn('[cors] CORS_ORIGINS is empty — every origin is allowed. Set it in production.');
}

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

const server = http.createServer(app);
const io = new SocketServer(server, { cors: corsOptions });

const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});
redis.on('error', (err: Error & { code?: string }) =>
  console.error('[redis]', err.code ?? err.name, err.message),
);

const store = new JobStore(redis, io);
const quota = new JobQuota(redis);
const tts = new TtsClient();
const video = new VideoClient();
const deps: PipelineDeps = { store, tts, video };

// Health is unauthenticated so the tunnel and container probes work; the
// generation API is not.
app.use('/api/health', createHealthRouter({ tts, video }));
app.use('/api/jobs', createAccessGuard(), createJobsRouter({ ...deps, quota }));

// Upload / body errors → JSON instead of an HTML stack trace.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(413).json({ error: err.message });
  }
  if (err instanceof Error) {
    return res.status(400).json({ error: err.message });
  }
  return res.status(500).json({ error: 'internal error' });
};
app.use(errorHandler);

// Job updates carry links to the portrait, voice clone and finished video, so
// the socket handshake is held to the same bar as the REST API.
const checkAccessToken = verifyAccessToken();
io.use((socket, next) => {
  const headers = socket.handshake.headers;
  const token =
    (headers['cf-access-jwt-assertion'] as string | undefined) ?? cookieToken(headers.cookie);
  void checkAccessToken(token).then((identity) => {
    if (!identity) return next(new Error('unauthorized'));
    next();
  });
});

io.on('connection', (socket) => {
  socket.emit('hello', { msg: 'connected to memorial-ai server' });
  // Clients join a per-job room to receive that job's progress updates.
  socket.on('job:subscribe', (jobId: string) => {
    if (typeof jobId === 'string') socket.join(jobId);
  });
});

/**
 * Picks up jobs that were in flight when the process stopped. A job already
 * handed to the video service is still running on DashScope and can be
 * collected; anything earlier than that has no recoverable state.
 */
async function recoverJobs(): Promise<void> {
  const unfinished = await store.listUnfinished();
  if (unfinished.length === 0) return;
  console.log(`[recover] ${unfinished.length} unfinished job(s) found`);

  for (const job of unfinished) {
    if (job.videoJobId) {
      console.log(`[recover] resuming job ${job.id} (video job ${job.videoJobId})`);
      void resumePipeline(job.id, job.videoJobId, deps);
    } else {
      await store.update(job.id, {
        status: 'failed',
        error: 'The server restarted before this farewell finished. Please start a new one.',
      });
    }
  }
}

server.listen(config.port, () => {
  console.log(`[server] listening on http://localhost:${config.port}`);
  void recoverJobs().catch((err) => console.error('[recover] failed:', err));
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(`[server] ${signal} received, shutting down`);
    server.close(() => {
      void redis.quit().finally(() => process.exit(0));
    });
  });
}

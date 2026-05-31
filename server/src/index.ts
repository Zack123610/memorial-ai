import 'dotenv/config';
import http from 'node:http';
import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import multer from 'multer';
import { Server as SocketServer } from 'socket.io';
import { config } from './config/env.js';
import { healthRouter } from './routes/health.js';
import { createJobsRouter } from './routes/jobs.js';
import { JobStore } from './jobs/store.js';
import { TtsClient } from './services/tts.js';
import { VideoClient } from './services/video.js';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

const server = http.createServer(app);
const io = new SocketServer(server, {
  cors: { origin: true, credentials: true },
});

const store = new JobStore(io);
const tts = new TtsClient();
const video = new VideoClient();

app.use('/api/health', healthRouter);
app.use('/api/jobs', createJobsRouter({ store, tts, video }));

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

io.on('connection', (socket) => {
  socket.emit('hello', { msg: 'connected to memorial-ai server' });
  // Clients join a per-job room to receive that job's progress updates.
  socket.on('job:subscribe', (jobId: string) => {
    if (typeof jobId === 'string') socket.join(jobId);
  });
});

server.listen(config.port, () => {
  console.log(`[server] listening on http://localhost:${config.port}`);
});

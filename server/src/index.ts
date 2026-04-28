import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server as SocketServer } from 'socket.io';
import { config } from './config/env.js';
import { healthRouter } from './routes/health.js';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.use('/api/health', healthRouter);

const server = http.createServer(app);
const io = new SocketServer(server, {
  cors: { origin: true, credentials: true },
});

io.on('connection', (socket) => {
  socket.emit('hello', { msg: 'connected to memorial-ai server' });
});

server.listen(config.port, () => {
  console.log(`[server] listening on http://localhost:${config.port}`);
});

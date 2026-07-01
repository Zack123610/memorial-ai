import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

/** Shared Socket.IO connection (same origin; Vite proxies /socket.io to the server). */
export function getSocket(): Socket {
  if (!socket) socket = io({ autoConnect: true });
  return socket;
}

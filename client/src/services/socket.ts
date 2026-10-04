import { io, type Socket } from 'socket.io-client';
import { socketUrl } from './config';

let socket: Socket | null = null;

/**
 * Shared Socket.IO connection.
 *
 * Same origin in development (Vite proxies /socket.io to the server). In
 * production it points at the API hostname, and `withCredentials` is needed so
 * the Cloudflare Access cookie rides along on the upgrade request — the server
 * rejects unauthenticated handshakes.
 */
export function getSocket(): Socket {
  if (!socket) {
    const options = { autoConnect: true, withCredentials: true };
    socket = socketUrl ? io(socketUrl, options) : io(options);
  }
  return socket;
}

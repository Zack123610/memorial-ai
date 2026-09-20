import { useEffect, useState } from 'react';
import { ApiError, getJob, type Job } from '../services/api';
import { getSocket } from '../services/socket';

const POLL_MS = 4_000;
const TERMINAL = new Set(['completed', 'failed']);

/** Loads a job once, keeps it live via Socket.IO, and falls back to REST polling. */
export function useJob(id: string): { job: Job | null; error: string | null; expired: boolean } {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    let active = true;
    setJob(null);
    setError(null);
    setExpired(false);

    const applyError = (e: unknown) => {
      if (!active) return;
      if (e instanceof ApiError && (e.status === 404 || e.code === 'JOB_EXPIRED')) {
        setExpired(true);
        setError(
          e.message ||
            'This job is no longer available (the server may have restarted). Start a new farewell.',
        );
        return;
      }
      setError(e instanceof Error ? e.message : 'Failed to load job');
    };

    getJob(id)
      .then((j) => active && setJob(j))
      .catch(applyError);

    const socket = getSocket();
    const subscribe = () => socket.emit('job:subscribe', id);
    const onUpdate = (j: Job) => {
      if (j.id === id) setJob(j);
    };

    subscribe();
    socket.on('connect', subscribe);
    socket.on('job:update', onUpdate);

    // REST polling covers Socket.IO drops and missed events.
    const timer = window.setInterval(() => {
      if (!active) return;
      void getJob(id)
        .then((j) => {
          if (!active) return;
          setJob(j);
          if (TERMINAL.has(j.status)) window.clearInterval(timer);
        })
        .catch((e: unknown) => {
          // Only surface expiry/404 from polls; transient network blips are ignored.
          if (e instanceof ApiError && (e.status === 404 || e.code === 'JOB_EXPIRED')) {
            applyError(e);
            window.clearInterval(timer);
          }
        });
    }, POLL_MS);

    return () => {
      active = false;
      window.clearInterval(timer);
      socket.off('connect', subscribe);
      socket.off('job:update', onUpdate);
    };
  }, [id]);

  return { job, error, expired };
}

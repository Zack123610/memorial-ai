import { useEffect, useState } from 'react';
import { getJob, type Job } from '../services/api';
import { getSocket } from '../services/socket';

/** Loads a job once, then keeps it live via Socket.IO `job:update` events. */
export function useJob(id: string): { job: Job | null; error: string | null } {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setJob(null);
    setError(null);

    getJob(id)
      .then((j) => active && setJob(j))
      .catch(
        (e: unknown) => active && setError(e instanceof Error ? e.message : 'Failed to load job'),
      );

    const socket = getSocket();
    const subscribe = () => socket.emit('job:subscribe', id);
    const onUpdate = (j: Job) => {
      if (j.id === id) setJob(j);
    };

    subscribe();
    socket.on('connect', subscribe); // re-subscribe after a reconnect
    socket.on('job:update', onUpdate);

    return () => {
      active = false;
      socket.off('connect', subscribe);
      socket.off('job:update', onUpdate);
    };
  }, [id]);

  return { job, error };
}

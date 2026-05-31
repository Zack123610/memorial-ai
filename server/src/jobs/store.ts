import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';

export type JobStatus = 'queued' | 'voice_cloning' | 'video_generating' | 'completed' | 'failed';

export interface Job {
  id: string;
  status: JobStatus;
  detail: string | null;
  videoUrl: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * In-memory job store. Jobs are lost on restart (acceptable for the MVP).
 * Every update is emitted to the Socket.IO room named after the job id.
 */
export class JobStore {
  private readonly jobs = new Map<string, Job>();

  constructor(private readonly io?: Server) {}

  create(): Job {
    const now = Date.now();
    const job: Job = {
      id: randomUUID(),
      status: 'queued',
      detail: null,
      videoUrl: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  update(id: string, patch: Partial<Omit<Job, 'id' | 'createdAt' | 'updatedAt'>>): Job | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    Object.assign(job, patch, { updatedAt: Date.now() });
    this.io?.to(id).emit('job:update', job);
    return job;
  }
}

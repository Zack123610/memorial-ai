import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { Server } from 'socket.io';
import { config } from '../config/env.js';

export type JobStatus = 'queued' | 'voice_cloning' | 'video_generating' | 'completed' | 'failed';

/** The job shape sent to the client. */
export interface Job {
  id: string;
  status: JobStatus;
  detail: string | null;
  videoUrl: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Persisted shape: adds fields needed to resume work, never sent to clients. */
export interface JobRecord extends Job {
  /**
   * video-service's own job id. Generation runs on DashScope and survives an
   * API restart, so keeping this lets polling be picked back up instead of
   * abandoning a video that has already been paid for.
   */
  videoJobId: string | null;
}

export type JobPatch = Partial<Omit<JobRecord, 'id' | 'createdAt' | 'updatedAt'>>;

const TERMINAL: ReadonlySet<JobStatus> = new Set<JobStatus>(['completed', 'failed']);

const ACTIVE_SET = 'jobs:active';

function recordKey(id: string): string {
  return `job:${id}`;
}

function toPublic(record: JobRecord): Job {
  return {
    id: record.id,
    status: record.status,
    detail: record.detail,
    videoUrl: record.videoUrl,
    imageUrl: record.imageUrl,
    audioUrl: record.audioUrl,
    error: record.error,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Redis-backed job store. Jobs outlive a restart, and every update is emitted
 * to the Socket.IO room named after the job id.
 */
export class JobStore {
  constructor(
    private readonly redis: Redis,
    private readonly io?: Server,
  ) {}

  async create(): Promise<Job> {
    const now = Date.now();
    const record: JobRecord = {
      id: randomUUID(),
      status: 'queued',
      detail: null,
      videoUrl: null,
      imageUrl: null,
      audioUrl: null,
      error: null,
      videoJobId: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.redis
      .multi()
      .set(recordKey(record.id), JSON.stringify(record), 'EX', config.jobTtlSeconds)
      .sadd(ACTIVE_SET, record.id)
      .exec();
    return toPublic(record);
  }

  async get(id: string): Promise<Job | undefined> {
    const record = await this.read(id);
    return record ? toPublic(record) : undefined;
  }

  /**
   * Applies a patch and broadcasts the result. A Redis write failure is logged
   * rather than thrown: losing a progress ping must not abort a job that is
   * already costing money downstream.
   */
  async update(id: string, patch: JobPatch): Promise<Job | undefined> {
    const record = await this.read(id).catch((err) => {
      console.error(`[store] failed to read job ${id}:`, err);
      return undefined;
    });
    if (!record) return undefined;

    Object.assign(record, patch, { updatedAt: Date.now() });

    try {
      const tx = this.redis
        .multi()
        .set(recordKey(id), JSON.stringify(record), 'EX', config.jobTtlSeconds);
      if (TERMINAL.has(record.status)) tx.srem(ACTIVE_SET, id);
      await tx.exec();
    } catch (err) {
      console.error(`[store] failed to persist job ${id}:`, err);
    }

    const view = toPublic(record);
    this.io?.to(id).emit('job:update', view);
    return view;
  }

  /**
   * Jobs that were mid-flight when the process stopped. Entries whose record
   * has already expired are pruned from the active set on the way out.
   */
  async listUnfinished(): Promise<JobRecord[]> {
    const ids = await this.redis.smembers(ACTIVE_SET);
    const unfinished: JobRecord[] = [];
    for (const id of ids) {
      const record = await this.read(id);
      if (!record) {
        await this.redis.srem(ACTIVE_SET, id);
        continue;
      }
      if (TERMINAL.has(record.status)) {
        await this.redis.srem(ACTIVE_SET, id);
        continue;
      }
      unfinished.push(record);
    }
    return unfinished;
  }

  private async read(id: string): Promise<JobRecord | undefined> {
    const raw = await this.redis.get(recordKey(id));
    if (!raw) return undefined;
    return JSON.parse(raw) as JobRecord;
  }
}

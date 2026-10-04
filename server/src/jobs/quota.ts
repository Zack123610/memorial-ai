import type { Redis } from 'ioredis';
import type { Request } from 'express';
import { config } from '../config/env.js';

export interface QuotaDecision {
  allowed: boolean;
  /** Why the request was refused, phrased for the end user. */
  reason?: string;
  /** Seconds until the exhausted window rolls over. */
  retryAfterSeconds?: number;
}

interface Window {
  key: string;
  limit: number;
  ttlSeconds: number;
  reason: string;
}

const HOUR_SECONDS = 60 * 60;
const DAY_SECONDS = 24 * HOUR_SECONDS;

/** Bucket id that rolls over on a fixed boundary, so counters self-expire. */
function bucket(nowMs: number, windowSeconds: number): number {
  return Math.floor(nowMs / 1000 / windowSeconds);
}

/**
 * Identifies the caller for quota purposes. The Access email is preferred
 * because it survives IP changes; `CF-Connecting-IP` is the fallback and is
 * trustworthy here only because Cloudflare is the sole ingress.
 */
export function callerId(req: Request): string {
  const email = req.accessIdentity?.email;
  if (email) return `email:${email.toLowerCase()}`;
  const cfIp = req.header('CF-Connecting-IP');
  if (cfIp) return `ip:${cfIp}`;
  return `ip:${req.ip ?? 'unknown'}`;
}

/**
 * Fixed-window generation quota.
 *
 * Every accepted job spends DashScope credit, so this is primarily a spend
 * ceiling: the global daily cap bounds the worst case even if a signed-in
 * account is shared or misused.
 */
export class JobQuota {
  constructor(private readonly redis: Redis) {}

  async consume(caller: string, nowMs = Date.now()): Promise<QuotaDecision> {
    const { perUserPerHour, perUserPerDay, globalPerDay } = config.quota;

    const windows: Window[] = [
      {
        key: `quota:global:${bucket(nowMs, DAY_SECONDS)}`,
        limit: globalPerDay,
        ttlSeconds: DAY_SECONDS,
        reason: 'Daily generation limit for this deployment has been reached. Try again tomorrow.',
      },
      {
        key: `quota:${caller}:d:${bucket(nowMs, DAY_SECONDS)}`,
        limit: perUserPerDay,
        ttlSeconds: DAY_SECONDS,
        reason: `You can create at most ${perUserPerDay} videos per day.`,
      },
      {
        key: `quota:${caller}:h:${bucket(nowMs, HOUR_SECONDS)}`,
        limit: perUserPerHour,
        ttlSeconds: HOUR_SECONDS,
        reason: `You can create at most ${perUserPerHour} videos per hour.`,
      },
    ].filter((window) => window.limit > 0);

    const consumed: Window[] = [];
    for (const window of windows) {
      const count = await this.increment(window);
      if (count > window.limit) {
        // Give back the windows already charged so one blocked request does
        // not also eat the caller's remaining allowance elsewhere.
        await this.refund([...consumed, window]);
        return {
          allowed: false,
          reason: window.reason,
          retryAfterSeconds: this.secondsUntilReset(nowMs, window.ttlSeconds),
        };
      }
      consumed.push(window);
    }

    return { allowed: true };
  }

  /** Returns quota to the caller when a job could not be started after all. */
  async release(caller: string, nowMs = Date.now()): Promise<void> {
    const { perUserPerHour, perUserPerDay, globalPerDay } = config.quota;
    const windows: Window[] = [];
    if (globalPerDay > 0) {
      windows.push({
        key: `quota:global:${bucket(nowMs, DAY_SECONDS)}`,
        limit: globalPerDay,
        ttlSeconds: DAY_SECONDS,
        reason: '',
      });
    }
    if (perUserPerDay > 0) {
      windows.push({
        key: `quota:${caller}:d:${bucket(nowMs, DAY_SECONDS)}`,
        limit: perUserPerDay,
        ttlSeconds: DAY_SECONDS,
        reason: '',
      });
    }
    if (perUserPerHour > 0) {
      windows.push({
        key: `quota:${caller}:h:${bucket(nowMs, HOUR_SECONDS)}`,
        limit: perUserPerHour,
        ttlSeconds: HOUR_SECONDS,
        reason: '',
      });
    }
    await this.refund(windows);
  }

  private async increment(window: Window): Promise<number> {
    const [[, count]] = (await this.redis
      .multi()
      .incr(window.key)
      .expire(window.key, window.ttlSeconds, 'NX')
      .exec()) as [[Error | null, number], ...unknown[]];
    return count;
  }

  private async refund(windows: Window[]): Promise<void> {
    if (windows.length === 0) return;
    const tx = this.redis.multi();
    for (const window of windows) tx.decr(window.key);
    await tx.exec();
  }

  private secondsUntilReset(nowMs: number, windowSeconds: number): number {
    const elapsed = Math.floor(nowMs / 1000) % windowSeconds;
    return windowSeconds - elapsed;
  }
}

/**
 * Exercises the Redis-backed job store and the generation quota against a real
 * Redis, covering the paths the e2e smoke test cannot reach without spending
 * DashScope credit: restart recovery and quota exhaustion/refund.
 *
 *   redis-server --port 6399 --daemonize yes
 *   REDIS_PORT=6399 node scripts/verify-store-quota.mjs
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Redis } from 'ioredis';

process.env.QUOTA_USER_HOUR ??= '2';
process.env.QUOTA_USER_DAY ??= '3';
process.env.QUOTA_GLOBAL_DAY ??= '4';

const { JobStore } = await import('../server/dist/jobs/store.js');
const { JobQuota } = await import('../server/dist/jobs/quota.js');

const redis = new Redis({
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: Number(process.env.REDIS_PORT ?? 6379),
});

await redis.flushdb();

const results = [];
const check = async (name, fn) => {
  await fn();
  results.push(name);
  console.log(`  ok  ${name}`);
};

console.log('JobStore');
const store = new JobStore(redis);

await check('create then get round-trips', async () => {
  const job = await store.create();
  const found = await store.get(job.id);
  assert.equal(found.id, job.id);
  assert.equal(found.status, 'queued');
});

await check('internal videoJobId is never exposed to clients', async () => {
  const job = await store.create();
  await store.update(job.id, { status: 'video_generating', videoJobId: 'vid-123' });
  const view = await store.get(job.id);
  assert.equal(view.videoJobId, undefined);
  assert.equal(view.status, 'video_generating');
});

await check('unfinished jobs are listed with their videoJobId for recovery', async () => {
  const unfinished = await store.listUnfinished();
  const withVideo = unfinished.filter((j) => j.videoJobId === 'vid-123');
  assert.equal(withVideo.length, 1, 'expected the submitted job to be recoverable');
});

await check('completed jobs drop out of the recovery set', async () => {
  const job = await store.create();
  await store.update(job.id, { status: 'completed', videoUrl: 'https://example.com/v.mp4' });
  const ids = (await store.listUnfinished()).map((j) => j.id);
  assert.ok(!ids.includes(job.id));
});

await check('a record survives a brand-new store instance (restart)', async () => {
  const job = await store.create();
  await store.update(job.id, { status: 'voice_cloning' });
  const fresh = new JobStore(redis);
  const found = await fresh.get(job.id);
  assert.equal(found.status, 'voice_cloning');
});

await check('missing job reads as undefined', async () => {
  assert.equal(await store.get('nope'), undefined);
});

await check('records carry a TTL so they expire on their own', async () => {
  const job = await store.create();
  const ttl = await redis.ttl(`job:${job.id}`);
  assert.ok(ttl > 0, `expected a positive TTL, got ${ttl}`);
});

console.log('JobQuota');
await redis.flushdb();
const quota = new JobQuota(redis);

await check('per-user hourly limit blocks the 3rd of 2', async () => {
  assert.equal((await quota.consume('email:a@example.com')).allowed, true);
  assert.equal((await quota.consume('email:a@example.com')).allowed, true);
  const third = await quota.consume('email:a@example.com');
  assert.equal(third.allowed, false);
  assert.match(third.reason, /per hour/);
  assert.ok(third.retryAfterSeconds > 0);
});

await check('a blocked request does not consume other windows', async () => {
  // a@ is hour-blocked above; the global counter should still have room for b@.
  assert.equal((await quota.consume('email:b@example.com')).allowed, true);
});

await check('global daily cap stops everyone once reached', async () => {
  await redis.flushdb();
  const callers = ['c@', 'd@', 'e@', 'f@', 'g@'].map((c) => `email:${c}example.com`);
  const allowed = [];
  for (const caller of callers) {
    allowed.push((await quota.consume(caller)).allowed);
  }
  // QUOTA_GLOBAL_DAY=4, so the 5th distinct caller is refused.
  assert.deepEqual(allowed, [true, true, true, true, false]);
});

await check('release refunds a reserved slot', async () => {
  await redis.flushdb();
  const caller = 'email:h@example.com';
  await quota.consume(caller);
  await quota.consume(caller);
  assert.equal((await quota.consume(caller)).allowed, false, 'hourly limit of 2 reached');
  await quota.release(caller);
  assert.equal((await quota.consume(caller)).allowed, true, 'slot should be reusable');
});

await check('a zeroed window is disabled rather than blocking everything', async () => {
  await redis.flushdb();
  // Limits are read from the environment when the config module loads, so this
  // has to run in a fresh process rather than by mutating process.env here.
  const script = `
    import { Redis } from 'ioredis';
    const { JobQuota } = await import('./server/dist/jobs/quota.js');
    const redis = new Redis({ host: '127.0.0.1', port: ${redis.options.port} });
    const quota = new JobQuota(redis);
    const allowed = [];
    for (let i = 0; i < 4; i += 1) {
      allowed.push((await quota.consume('email:i@example.com')).allowed);
    }
    await redis.quit();
    console.log(JSON.stringify(allowed));
  `;
  const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script], {
    cwd: new URL('..', import.meta.url).pathname,
    env: {
      ...process.env,
      QUOTA_USER_HOUR: '0',
      QUOTA_USER_DAY: '0',
      QUOTA_GLOBAL_DAY: '0',
    },
  });
  assert.deepEqual(JSON.parse(stdout.trim()), [true, true, true, true]);
});

await redis.flushdb();
await redis.quit();
console.log(`\n${results.length} checks passed`);

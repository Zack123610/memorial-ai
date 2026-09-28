#!/usr/bin/env node
/**
 * Phase 4 smoke tests.
 *
 * Always:
 *   - unit checks for WAV duration + video-duration clamping
 *   - API validation against a running Express server (if reachable)
 *
 * Optional full pipeline (costs DashScope credits):
 *   E2E_LIVE=1 npm run test:e2e
 *
 * Env:
 *   SERVER_URL   default http://localhost:3001
 *   E2E_LIVE     set to 1 to run upload → poll → videoUrl
 *   E2E_TIMEOUT  poll timeout ms (default 900000)
 */

import { Buffer } from 'node:buffer';
import { setTimeout as sleep } from 'node:timers/promises';

const SERVER_URL = (process.env.SERVER_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const LIVE = process.env.E2E_LIVE === '1';
const POLL_TIMEOUT_MS = Number(process.env.E2E_TIMEOUT ?? 900_000);

let passed = 0;
let failed = 0;

function ok(name) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function fail(name, err) {
  failed += 1;
  console.error(`  ✗ ${name}`);
  console.error(`    ${err instanceof Error ? err.message : err}`);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** Minimal 1×1 JPEG. */
function tinyJpeg() {
  return Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z',
    'base64',
  );
}

/** PCM WAV of `seconds` duration at 16 kHz mono. */
function sineWav(seconds = 4, sampleRate = 16_000, freq = 220) {
  const samples = Math.floor(sampleRate * seconds);
  const dataSize = samples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * freq * t) * 0.2;
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.floor(sample * 32767))), 44 + i * 2);
  }
  return buf;
}

function wavDurationSeconds(buf) {
  if (buf.length < 44) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    return null;
  }
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataSize = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === 'fmt ' && start + 16 <= buf.length) {
      channels = buf.readUInt16LE(start + 2);
      sampleRate = buf.readUInt32LE(start + 4);
      bitsPerSample = buf.readUInt16LE(start + 14);
    } else if (id === 'data') {
      dataSize = size;
      break;
    }
    offset = start + size + (size % 2);
  }
  if (!sampleRate || !channels || !bitsPerSample || !dataSize) return null;
  const bytesPerSample = (bitsPerSample / 8) * channels;
  if (bytesPerSample <= 0) return null;
  return dataSize / (sampleRate * bytesPerSample);
}

function clampVideoDuration(seconds, min, max, fallback) {
  if (!Number.isFinite(seconds) || seconds <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.ceil(seconds)));
}

async function runUnitChecks() {
  console.log('\n[unit] audio helpers');
  try {
    const wav = sineWav(4);
    const dur = wavDurationSeconds(wav);
    assert(dur !== null && Math.abs(dur - 4) < 0.05, `expected ~4s, got ${dur}`);
    ok('wavDurationSeconds reads 4s PCM WAV');
  } catch (err) {
    fail('wavDurationSeconds', err);
  }

  try {
    assert(clampVideoDuration(3.2, 5, 10, 5) === 5, 'should clamp up to min');
    assert(clampVideoDuration(7.1, 5, 10, 5) === 8, 'should ceil into window');
    assert(clampVideoDuration(99, 5, 10, 5) === 10, 'should clamp to max');
    assert(clampVideoDuration(NaN, 5, 10, 5) === 5, 'should fall back');
    ok('clampVideoDuration windowing');
  } catch (err) {
    fail('clampVideoDuration', err);
  }
}

async function serverReachable() {
  try {
    const res = await fetch(`${SERVER_URL}/api/health`, {
      signal: AbortSignal.timeout(3_000),
    });
    return res.ok || res.status === 503; // 503 = degraded but server is up
  } catch {
    return false;
  }
}

async function runApiValidation() {
  console.log(`\n[api] validation against ${SERVER_URL}`);
  const up = await serverReachable();
  if (!up) {
    console.log('  ⚠ server not reachable — skipping API checks (start with npm run dev)');
    return;
  }

  try {
    const health = await fetch(`${SERVER_URL}/api/health`).then((r) => r.json());
    assert(health.service === 'memorial-ai-server', 'unexpected health payload');
    assert(health.downstream?.tts && health.downstream?.video, 'missing downstream probes');
    ok(`health status=${health.status} (tts=${health.downstream.tts.status}, video=${health.downstream.video.status})`);
  } catch (err) {
    fail('health aggregation', err);
  }

  try {
    const res = await fetch(`${SERVER_URL}/api/jobs/does-not-exist`);
    const body = await res.json();
    assert(res.status === 404, `expected 404, got ${res.status}`);
    assert(body.code === 'JOB_EXPIRED', `expected JOB_EXPIRED, got ${body.code}`);
    ok('missing job returns JOB_EXPIRED');
  } catch (err) {
    fail('JOB_EXPIRED response', err);
  }

  try {
    const form = new FormData();
    form.append('image', new Blob([tinyJpeg()], { type: 'image/jpeg' }), 'face.jpg');
    form.append('audio', new Blob([sineWav(4)], { type: 'audio/wav' }), 'voice.wav');
    form.append('refText', 'hello');
    form.append('text', 'x'.repeat(900));
    form.append('language', 'English');
    const res = await fetch(`${SERVER_URL}/api/jobs`, { method: 'POST', body: form });
    const body = await res.json();
    assert(res.status === 422, `expected 422 for long text, got ${res.status}`);
    assert(String(body.error).toLowerCase().includes('text'), `unexpected error: ${body.error}`);
    ok('rejects farewell text over MAX_TEXT_CHARS');
  } catch (err) {
    fail('long text rejection', err);
  }
}

async function runLivePipeline() {
  console.log('\n[live] full upload → generate → download URL');
  const form = new FormData();
  form.append('image', new Blob([tinyJpeg()], { type: 'image/jpeg' }), 'face.jpg');
  form.append('audio', new Blob([sineWav(5)], { type: 'audio/wav' }), 'voice.wav');
  form.append('refText', 'This is a short test of my voice for cloning.');
  form.append(
    'text',
    'Hello my dear family. Thank you for being here today. I love you all.',
  );
  form.append('language', 'English');

  const created = await fetch(`${SERVER_URL}/api/jobs`, { method: 'POST', body: form });
  if (!created.ok) {
    throw new Error(`create failed ${created.status}: ${await created.text()}`);
  }
  const { jobId } = await created.json();
  console.log(`  job ${jobId} created — polling…`);

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    const res = await fetch(`${SERVER_URL}/api/jobs/${jobId}`);
    if (!res.ok) throw new Error(`poll failed ${res.status}: ${await res.text()}`);
    const job = await res.json();
    process.stdout.write(`  … ${job.status}${job.detail ? ` (${job.detail})` : ''}\n`);
    if (job.status === 'completed') {
      assert(job.videoUrl, 'completed without videoUrl');
      ok(`pipeline completed → ${job.videoUrl}`);
      return;
    }
    if (job.status === 'failed') {
      throw new Error(job.error ?? 'job failed');
    }
    if (Date.now() > deadline) throw new Error('poll timed out');
    await sleep(5_000);
  }
}

async function main() {
  console.log('Memorial AI — Phase 4 smoke');
  await runUnitChecks();
  await runApiValidation();

  if (LIVE) {
    try {
      await runLivePipeline();
    } catch (err) {
      fail('live pipeline', err);
    }
  } else {
    console.log('\n[live] skipped (set E2E_LIVE=1 to run full generation)');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

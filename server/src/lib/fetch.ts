/** Fetch with an AbortSignal timeout. */
export async function fetchWithTimeout(
  input: string | URL,
  init: Parameters<typeof fetch>[1] = {},
  timeoutMs = 30_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function isRetryable(err: unknown, status?: number): boolean {
  if (status !== undefined) {
    return status === 408 || status === 429 || status >= 500;
  }
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    err.name === 'AbortError' ||
    msg.includes('timed out') ||
    msg.includes('fetch failed') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset')
  );
}

/**
 * Run `fn` once, then retry on transient network/5xx failures.
 * `retries` is the number of *extra* attempts after the first.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  {
    retries = 1,
    label = 'request',
  }: {
    retries?: number;
    label?: string;
  } = {},
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status =
        err && typeof err === 'object' && 'status' in err
          ? Number((err as { status: number }).status)
          : undefined;
      if (attempt >= retries || !isRetryable(err, status)) throw err;
      const waitMs = 500 * (attempt + 1);
      console.warn(`[retry] ${label} attempt ${attempt + 1} failed; retrying in ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

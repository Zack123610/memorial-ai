import { apiBase } from './config';

export type JobStatus = 'queued' | 'voice_cloning' | 'video_generating' | 'completed' | 'failed';

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

export interface CreateJobInput {
  image: File;
  audio: File;
  refText: string;
  text: string;
  language: 'English' | 'Chinese';
}

export class ApiError extends Error {
  static readonly signInHint =
    'Could not reach the server. If you were signed in, your session may have expired — reload the page to sign in again.';

  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function readError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as {
    error?: string;
    code?: string;
    hint?: string;
  } | null;
  const message = body?.hint
    ? `${body.error ?? 'Request failed'}. ${body.hint}`
    : (body?.error ?? `Request failed (${res.status})`);
  return new ApiError(message, res.status, body?.code);
}

/**
 * `credentials: 'include'` is required in production: the client and API are on
 * different hostnames, and without it the browser withholds the Cloudflare
 * Access cookie and every call is rejected.
 */
async function request(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${apiBase}${path}`, { ...init, credentials: 'include' });
  } catch {
    // A rejected fetch here is usually an expired Access session: the redirect
    // to the login page is cross-origin and surfaces as a network error.
    throw new ApiError(ApiError.signInHint, 0, 'NETWORK');
  }
}

export async function createJob(
  input: CreateJobInput,
): Promise<{ jobId: string; status: JobStatus }> {
  const form = new FormData();
  form.append('image', input.image);
  form.append('audio', input.audio);
  form.append('refText', input.refText);
  form.append('text', input.text);
  form.append('language', input.language);

  const res = await request('/api/jobs', { method: 'POST', body: form });
  if (!res.ok) throw await readError(res);
  return res.json() as Promise<{ jobId: string; status: JobStatus }>;
}

export async function getJob(id: string): Promise<Job> {
  const res = await request(`/api/jobs/${id}`);
  if (!res.ok) throw await readError(res);
  return res.json() as Promise<Job>;
}

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

export interface CreateJobInput {
  image: File;
  audio: File;
  refText: string;
  text: string;
  language: 'English' | 'Chinese';
}

export class ApiError extends Error {
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

export async function createJob(
  input: CreateJobInput,
): Promise<{ jobId: string; status: JobStatus }> {
  const form = new FormData();
  form.append('image', input.image);
  form.append('audio', input.audio);
  form.append('refText', input.refText);
  form.append('text', input.text);
  form.append('language', input.language);

  const res = await fetch('/api/jobs', { method: 'POST', body: form });
  if (!res.ok) throw await readError(res);
  return res.json() as Promise<{ jobId: string; status: JobStatus }>;
}

export async function getJob(id: string): Promise<Job> {
  const res = await fetch(`/api/jobs/${id}`);
  if (!res.ok) throw await readError(res);
  return res.json() as Promise<Job>;
}

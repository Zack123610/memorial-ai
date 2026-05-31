import { Link, useParams } from 'react-router-dom';
import Page from '../components/Page';
import { useJob } from '../hooks/useJob';
import type { JobStatus } from '../services/api';

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: 'Queued',
  voice_cloning: 'Cloning the voice…',
  video_generating: 'Generating the video…',
  completed: 'Ready',
  failed: 'Failed',
};

export default function Job() {
  const { id = '' } = useParams();
  const { job, error } = useJob(id);

  if (error) {
    return (
      <Page>
        <h1 className="mb-4 font-serif text-3xl text-memorial-accent">Job not found</h1>
        <p className="text-memorial-muted">{error}</p>
        <Link to="/create" className="mt-6 inline-block text-memorial-accent hover:underline">
          ← Start a new one
        </Link>
      </Page>
    );
  }

  if (!job) {
    return (
      <Page>
        <p className="text-memorial-muted">Loading…</p>
      </Page>
    );
  }

  if (job.status === 'completed' && job.videoUrl) {
    return (
      <Page>
        <h1 className="mb-6 font-serif text-4xl text-memorial-accent">Your farewell video</h1>
        <video src={job.videoUrl} controls className="w-full rounded border border-white/10" />
        <div className="mt-6 flex items-center gap-6">
          <a
            href={job.videoUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded bg-memorial-accent px-5 py-2 font-medium text-memorial-bg transition hover:opacity-90"
          >
            Download video
          </a>
          <Link to="/create" className="text-memorial-muted hover:text-white">
            Create another
          </Link>
        </div>
      </Page>
    );
  }

  if (job.status === 'failed') {
    return (
      <Page>
        <h1 className="mb-4 font-serif text-3xl text-memorial-accent">Generation failed</h1>
        <p className="text-red-400">{job.error ?? 'Something went wrong.'}</p>
        <Link to="/create" className="mt-6 inline-block text-memorial-accent hover:underline">
          ← Try again
        </Link>
      </Page>
    );
  }

  // In progress: queued / voice_cloning / video_generating
  return (
    <Page>
      <div className="flex flex-col items-center space-y-4 py-12 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-memorial-muted border-t-memorial-accent" />
        <h1 className="font-serif text-3xl text-memorial-accent">{STATUS_LABEL[job.status]}</h1>
        {job.detail && <p className="text-sm text-memorial-muted">{job.detail}</p>}
        <p className="text-xs text-memorial-muted">
          This can take a few minutes. Keep this page open.
        </p>
      </div>
    </Page>
  );
}

import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import Page from '../components/Page';
import { useJob } from '../hooks/useJob';
import type { JobStatus } from '../services/api';
import { stagger, riseItem, ease } from '../lib/motion';

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: 'Queued',
  voice_cloning: 'Cloning the voice…',
  video_generating: 'Generating the video…',
  completed: 'Ready',
  failed: 'Failed',
};

/** Ordered stages shown in the progress stepper. */
const STAGES: { key: JobStatus; label: string }[] = [
  { key: 'queued', label: 'Queued' },
  { key: 'voice_cloning', label: 'Cloning voice' },
  { key: 'video_generating', label: 'Generating video' },
];

function stageIndex(status: JobStatus): number {
  const i = STAGES.findIndex((s) => s.key === status);
  return i === -1 ? STAGES.length : i; // completed → past the last stage
}

export default function Job() {
  const { id = '' } = useParams();
  const { job, error } = useJob(id);

  if (error) {
    return (
      <Page>
        <motion.div variants={stagger} initial="hidden" animate="show" className="text-center">
          <motion.h1 variants={riseItem} className="mb-4 font-serif text-4xl text-white/90">
            Job not found
          </motion.h1>
          <motion.p variants={riseItem} className="text-memorial-muted">
            {error}
          </motion.p>
          <motion.div variants={riseItem}>
            <Link
              to="/create"
              className="mt-8 inline-block text-memorial-accent underline-offset-4 hover:underline"
            >
              ← Start a new one
            </Link>
          </motion.div>
        </motion.div>
      </Page>
    );
  }

  if (!job) {
    return (
      <Page>
        <div className="flex flex-col items-center gap-4 py-24 text-center">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-memorial-accent" />
          <p className="text-memorial-muted">Loading…</p>
        </div>
      </Page>
    );
  }

  if (job.status === 'completed' && job.videoUrl) {
    return (
      <Page>
        <motion.div variants={stagger} initial="hidden" animate="show">
          <motion.div variants={riseItem} className="mb-2 text-center">
            <span className="text-xs uppercase tracking-[0.2em] text-memorial-accent">
              Complete
            </span>
          </motion.div>
          <motion.h1
            variants={riseItem}
            className="mb-8 text-center font-serif text-5xl text-white/95"
          >
            Your farewell video
          </motion.h1>

          <motion.div
            variants={riseItem}
            className="overflow-hidden rounded-2xl border border-white/10 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]"
          >
            <video src={job.videoUrl} controls className="w-full" />
          </motion.div>

          <motion.div variants={riseItem} className="mt-8 flex items-center justify-center gap-6">
            <motion.a
              href={job.videoUrl}
              target="_blank"
              rel="noreferrer"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.2, ease }}
              className="rounded-full bg-memorial-accent px-7 py-3 font-medium text-memorial-bg transition hover:shadow-[0_0_40px_-6px_rgba(168,149,120,0.7)]"
            >
              Download video
            </motion.a>
            <Link to="/create" className="text-memorial-muted transition hover:text-white">
              Create another
            </Link>
          </motion.div>
        </motion.div>
      </Page>
    );
  }

  if (job.status === 'failed') {
    return (
      <Page>
        <motion.div variants={stagger} initial="hidden" animate="show" className="text-center">
          <motion.h1 variants={riseItem} className="mb-4 font-serif text-4xl text-white/90">
            Generation failed
          </motion.h1>
          <motion.p
            variants={riseItem}
            className="mx-auto max-w-md rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-red-300"
          >
            {job.error ?? 'Something went wrong.'}
          </motion.p>
          <motion.div variants={riseItem}>
            <Link
              to="/create"
              className="mt-8 inline-block text-memorial-accent underline-offset-4 hover:underline"
            >
              ← Try again
            </Link>
          </motion.div>
        </motion.div>
      </Page>
    );
  }

  // In progress: queued / voice_cloning / video_generating
  const current = stageIndex(job.status);

  return (
    <Page>
      <div className="flex flex-col items-center gap-8 py-16 text-center">
        {/* Glowing orbital spinner */}
        <div className="relative h-24 w-24">
          <span className="absolute inset-0 animate-pulse-soft rounded-full bg-memorial-accent/20 blur-xl" />
          <span className="absolute inset-0 animate-spin rounded-full border-2 border-white/10 border-t-memorial-accent [animation-duration:1.4s]" />
          <span className="absolute inset-3 animate-spin rounded-full border border-white/5 border-b-memorial-accent/60 [animation-direction:reverse] [animation-duration:2s]" />
        </div>

        <motion.h1
          key={job.status}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease }}
          className="font-serif text-4xl text-white/95"
        >
          {STATUS_LABEL[job.status]}
        </motion.h1>

        {/* Stage stepper */}
        <div className="flex items-center gap-3">
          {STAGES.map((stage, i) => {
            const done = i < current;
            const active = i === current;
            return (
              <div key={stage.key} className="flex items-center gap-3">
                <div className="flex flex-col items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full transition-colors duration-500 ${
                      done
                        ? 'bg-memorial-accent'
                        : active
                          ? 'animate-pulse-soft bg-memorial-accent shadow-[0_0_12px_2px_rgba(168,149,120,0.6)]'
                          : 'bg-white/15'
                    }`}
                  />
                  <span
                    className={`text-xs transition-colors duration-500 ${
                      active ? 'text-white' : 'text-memorial-muted'
                    }`}
                  >
                    {stage.label}
                  </span>
                </div>
                {i < STAGES.length - 1 && (
                  <span
                    className={`mb-5 h-px w-10 transition-colors duration-500 ${
                      done ? 'bg-memorial-accent/60' : 'bg-white/10'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {job.detail && <p className="text-sm text-memorial-muted">{job.detail}</p>}
        <p className="text-xs text-memorial-muted">
          This can take a few minutes. Keep this page open.
        </p>
      </div>
    </Page>
  );
}

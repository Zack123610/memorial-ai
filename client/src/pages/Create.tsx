import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Page from '../components/Page';
import { createJob } from '../services/api';
import { stagger, riseItem, ease } from '../lib/motion';

const inputClass =
  'w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white placeholder:text-memorial-muted transition focus:border-memorial-accent/60 focus:bg-black/30 focus:outline-none focus:ring-2 focus:ring-memorial-accent/20';

const fileClass =
  'w-full cursor-pointer rounded-xl border border-dashed border-white/15 bg-black/20 px-4 py-3 text-sm text-memorial-muted transition hover:border-memorial-accent/50 hover:text-white file:mr-4 file:rounded-full file:border-0 file:bg-memorial-accent/90 file:px-4 file:py-1.5 file:text-memorial-bg file:transition hover:file:bg-memorial-accent';

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <motion.div variants={riseItem} className="space-y-2">
      <label className="flex items-baseline justify-between text-sm text-white/80">
        <span>{label}</span>
        {hint && <span className="text-xs text-memorial-muted">{hint}</span>}
      </label>
      {children}
    </motion.div>
  );
}

export default function Create() {
  const navigate = useNavigate();
  const [image, setImage] = useState<File | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
  const [refText, setRefText] = useState('');
  const [text, setText] = useState('');
  const [language, setLanguage] = useState<'English' | 'Chinese'>('English');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = Boolean(image && audio && refText.trim() && text.trim());

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!image || !audio || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { jobId } = await createJob({ image, audio, refText, text, language });
      navigate(`/jobs/${jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSubmitting(false);
    }
  }

  return (
    <Page>
      <motion.div variants={stagger} initial="hidden" animate="show">
        <motion.div variants={riseItem} className="mb-2 text-center">
          <span className="text-xs uppercase tracking-[0.2em] text-memorial-accent">
            Create a farewell
          </span>
        </motion.div>
        <motion.h1
          variants={riseItem}
          className="mb-10 text-center font-serif text-5xl text-white/95"
        >
          Their last words
        </motion.h1>

        <motion.form
          variants={stagger}
          onSubmit={onSubmit}
          className="glass space-y-6 rounded-3xl p-7 sm:p-9"
        >
          <Field label="Photo of the person" hint="JPG or PNG">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImage(e.target.files?.[0] ?? null)}
              className={fileClass}
            />
          </Field>

          <Field label="Voice sample" hint="WAV or MP3, 3–60s">
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setAudio(e.target.files?.[0] ?? null)}
              className={fileClass}
            />
          </Field>

          <Field label="Transcript of the voice sample">
            <textarea
              value={refText}
              onChange={(e) => setRefText(e.target.value)}
              rows={2}
              placeholder="Exactly what is said in the voice sample above"
              className={inputClass}
            />
          </Field>

          <Field label="Farewell message">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder="The words you want spoken in the video"
              className={inputClass}
            />
          </Field>

          <Field label="Language">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'English' | 'Chinese')}
              className={inputClass}
            >
              <option value="English">English</option>
              <option value="Chinese">Chinese</option>
            </select>
          </Field>

          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-300"
            >
              {error}
            </motion.p>
          )}

          <motion.button
            variants={riseItem}
            type="submit"
            disabled={!ready || submitting}
            whileHover={ready && !submitting ? { scale: 1.02 } : undefined}
            whileTap={ready && !submitting ? { scale: 0.98 } : undefined}
            transition={{ duration: 0.2, ease }}
            className="group relative w-full overflow-hidden rounded-full bg-memorial-accent px-6 py-3.5 font-medium text-memorial-bg transition hover:shadow-[0_0_40px_-6px_rgba(168,149,120,0.7)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-memorial-bg/40 border-t-memorial-bg" />
                Creating…
              </span>
            ) : (
              'Generate video'
            )}
          </motion.button>
        </motion.form>
      </motion.div>
    </Page>
  );
}

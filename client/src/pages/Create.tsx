import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Page from '../components/Page';
import { createJob } from '../services/api';

const inputClass =
  'w-full rounded border border-white/10 bg-memorial-surface px-3 py-2 text-white placeholder:text-memorial-muted focus:border-memorial-accent focus:outline-none';

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
      <h1 className="mb-8 font-serif text-4xl text-memorial-accent">Create a farewell</h1>

      <form onSubmit={onSubmit} className="space-y-6">
        <div className="space-y-2">
          <label className="block text-sm text-memorial-muted">Photo of the person</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setImage(e.target.files?.[0] ?? null)}
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm text-memorial-muted">Voice sample (WAV or MP3)</label>
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => setAudio(e.target.files?.[0] ?? null)}
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm text-memorial-muted">
            Transcript of the voice sample
          </label>
          <textarea
            value={refText}
            onChange={(e) => setRefText(e.target.value)}
            rows={2}
            placeholder="Exactly what is said in the voice sample above"
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm text-memorial-muted">Farewell message</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder="The words you want spoken in the video"
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm text-memorial-muted">Language</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as 'English' | 'Chinese')}
            className={inputClass}
          >
            <option value="English">English</option>
            <option value="Chinese">Chinese</option>
          </select>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={!ready || submitting}
          className="rounded bg-memorial-accent px-6 py-3 font-medium text-memorial-bg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? 'Creating…' : 'Generate video'}
        </button>
      </form>
    </Page>
  );
}

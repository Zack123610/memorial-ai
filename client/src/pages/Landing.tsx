import { Link } from 'react-router-dom';
import Page from '../components/Page';

export default function Landing() {
  return (
    <Page>
      <div className="flex flex-col items-center space-y-8 text-center">
        <h1 className="font-serif text-6xl text-memorial-accent">Memorial AI</h1>
        <p className="max-w-lg text-lg text-memorial-muted">
          A space for meaningful goodbyes. Create a farewell video from a single photo, a short
          voice sample, and a final message.
        </p>
        <Link
          to="/create"
          className="rounded bg-memorial-accent px-6 py-3 font-medium text-memorial-bg transition hover:opacity-90"
        >
          Begin
        </Link>
      </div>
    </Page>
  );
}

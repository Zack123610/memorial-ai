import { useEffect, useState } from 'react';

export default function App() {
  const [serverHealth, setServerHealth] = useState<string>('checking…');

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setServerHealth(d.status ?? 'unknown'))
      .catch(() => setServerHealth('offline'));
  }, []);

  return (
    <main className="min-h-screen bg-memorial-bg text-white flex items-center justify-center p-8">
      <div className="max-w-xl text-center space-y-6">
        <h1 className="font-serif text-5xl text-memorial-accent">Memorial AI</h1>
        <p className="text-memorial-muted">
          A space for meaningful goodbyes. Phase 0 scaffolding is live.
        </p>
        <div className="text-sm text-memorial-muted">
          Backend status: <span className="text-white">{serverHealth}</span>
        </div>
      </div>
    </main>
  );
}

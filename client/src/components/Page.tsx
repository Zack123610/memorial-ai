import type { ReactNode } from 'react';

/** Shared page shell: dark memorial background + centered content column. */
export default function Page({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-memorial-bg text-white">
      <div className="mx-auto w-full max-w-2xl px-6 py-12">{children}</div>
    </main>
  );
}

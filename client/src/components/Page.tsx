import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import Aurora from './Aurora';
import { pageTransition } from '../lib/motion';

type PageProps = {
  children: ReactNode;
  /** Use a wider column for the cinematic hero. */
  wide?: boolean;
};

/**
 * Shared page shell: animated aurora backdrop, slim top nav, and an animated
 * content column with route-level enter/exit transitions.
 */
export default function Page({ children, wide = false }: PageProps) {
  return (
    <div className="relative min-h-screen text-white">
      <Aurora />

      {/* Top navigation. */}
      <header className="sticky top-0 z-20">
        <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
          <Link
            to="/"
            className="group flex items-center gap-2 text-sm font-medium tracking-wide text-white/90"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-memorial-accent shadow-[0_0_12px_2px_rgba(168,149,120,0.6)] transition group-hover:scale-125" />
            Memorial&nbsp;AI
          </Link>
        </nav>
      </header>

      <motion.main
        variants={pageTransition}
        initial="hidden"
        animate="show"
        exit="exit"
        className={`mx-auto w-full px-6 pb-24 pt-6 ${wide ? 'max-w-6xl' : 'max-w-2xl'}`}
      >
        {children}
      </motion.main>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Page from '../components/Page';
import { stagger, riseItem, revealOnScroll, ease } from '../lib/motion';

const STEPS = [
  {
    n: '01',
    title: 'Upload',
    body: 'A single photo and a short voice sample of your loved one.',
  },
  {
    n: '02',
    title: 'Write',
    body: 'The farewell message — the words you want spoken aloud.',
  },
  {
    n: '03',
    title: 'Remember',
    body: 'We clone the voice, animate the portrait, and return a video.',
  },
];

export default function Landing() {
  return (
    <Page wide>
      {/* Hero */}
      <section className="relative flex min-h-[78vh] flex-col items-center justify-center text-center">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="flex flex-col items-center"
        >
          <motion.span
            variants={riseItem}
            className="mb-6 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-memorial-accent backdrop-blur"
          >
            Farewells worth remembering
          </motion.span>

          <motion.h1
            variants={riseItem}
            className="font-serif text-6xl leading-[1.05] tracking-tight sm:text-7xl md:text-8xl"
          >
            <span className="text-gradient animate-shimmer">A final message,</span>
            <br />
            <span className="text-white/95">in their own voice.</span>
          </motion.h1>

          <motion.p
            variants={riseItem}
            className="mt-8 max-w-xl text-lg leading-relaxed text-memorial-muted"
          >
            Memorial AI creates a hyper-personalized farewell video from a single photo, a short
            voice sample, and a few heartfelt words — so families can see and hear their loved ones
            one last time.
          </motion.p>

          <motion.div variants={riseItem} className="mt-10 flex items-center gap-5">
            <Link
              to="/create"
              className="group relative overflow-hidden rounded-full bg-memorial-accent px-8 py-3.5 font-medium text-memorial-bg transition hover:shadow-[0_0_40px_-6px_rgba(168,149,120,0.7)]"
            >
              <span className="relative z-10">Begin a farewell</span>
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            </Link>
            <a
              href="#how"
              className="text-sm text-memorial-muted underline-offset-4 transition hover:text-white hover:underline"
            >
              How it works
            </a>
          </motion.div>
        </motion.div>

        {/* Scroll cue */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1, duration: 1 }}
          className="absolute bottom-2 left-1/2 -translate-x-1/2"
        >
          <div className="flex h-9 w-5 items-start justify-center rounded-full border border-white/15 p-1">
            <motion.span
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              className="h-1.5 w-1 rounded-full bg-memorial-accent"
            />
          </div>
        </motion.div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-24 py-20">
        <motion.h2
          variants={revealOnScroll}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          className="mb-14 text-center font-serif text-4xl text-white/90"
        >
          Three steps to a goodbye.
        </motion.h2>

        <motion.div
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.15 } } }}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          className="grid gap-6 md:grid-cols-3"
        >
          {STEPS.map((step) => (
            <motion.div
              key={step.n}
              variants={revealOnScroll}
              whileHover={{ y: -6, transition: { duration: 0.3, ease } }}
              className="glass rounded-2xl p-7"
            >
              <span className="font-serif text-5xl text-memorial-accent/40">{step.n}</span>
              <h3 className="mt-4 font-serif text-2xl text-white">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-memorial-muted">{step.body}</p>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          variants={revealOnScroll}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="mt-16 text-center"
        >
          <Link
            to="/create"
            className="inline-flex items-center gap-2 rounded-full border border-memorial-accent/40 px-7 py-3 text-memorial-accent transition hover:bg-memorial-accent hover:text-memorial-bg"
          >
            Create a farewell video
            <span aria-hidden>→</span>
          </Link>
        </motion.div>
      </section>
    </Page>
  );
}

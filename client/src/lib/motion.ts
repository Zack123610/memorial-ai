import type { Variants, Transition } from 'framer-motion';

/** Calm, slightly slow easing that suits the memorial tone. */
export const ease: Transition['ease'] = [0.22, 1, 0.36, 1];

/** Container that staggers its children in on mount. */
export const stagger: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.12, delayChildren: 0.05 },
  },
};

/** Child item: fade + rise. Pairs with `stagger`. */
export const riseItem: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease } },
};

/** Scroll-reveal: fades up when scrolled into view. */
export const revealOnScroll: Variants = {
  hidden: { opacity: 0, y: 40 },
  show: { opacity: 1, y: 0, transition: { duration: 0.8, ease } },
};

/** Page-level enter/exit transition for route changes. */
export const pageTransition: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
  exit: { opacity: 0, y: -12, transition: { duration: 0.3, ease } },
};

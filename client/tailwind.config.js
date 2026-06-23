/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        memorial: {
          bg: '#0f0f12',
          surface: '#1a1a20',
          accent: '#a89578',
          'accent-bright': '#d8c4a0',
          muted: '#7a7a85',
        },
        // Aurora glow stops — muted, candle-lit tones kept tasteful for a
        // memorial context (warm gold, deep violet, soft rose).
        aurora: {
          gold: '#c9a86a',
          violet: '#5b4b8a',
          rose: '#8a5b6e',
          teal: '#3f6b6e',
        },
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        // Slow drift for the aurora blobs.
        'drift-a': {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)' },
          '50%': { transform: 'translate3d(6%, -8%, 0) scale(1.15)' },
        },
        'drift-b': {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1.1)' },
          '50%': { transform: 'translate3d(-7%, 6%, 0) scale(0.95)' },
        },
        'drift-c': {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)' },
          '50%': { transform: 'translate3d(5%, 7%, 0) scale(1.2)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'drift-a': 'drift-a 18s ease-in-out infinite',
        'drift-b': 'drift-b 22s ease-in-out infinite',
        'drift-c': 'drift-c 26s ease-in-out infinite',
        shimmer: 'shimmer 6s linear infinite',
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

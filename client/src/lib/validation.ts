/** Shared create-form limits (keep in sync with server config defaults). */
export const CREATE_LIMITS = {
  maxTextChars: 800,
  maxRefTextChars: 500,
  minAudioSeconds: 3,
  maxAudioSeconds: 60,
  /** VIDEO_DURATION_MAX: the video lasts as long as the spoken farewell. */
  maxSpeechSeconds: 15,
} as const;

// Mirrors CHARS_PER_SECOND in server/src/lib/audio.ts.
const CHARS_PER_SECOND = { English: 12, Chinese: 4 } as const;

export type Language = keyof typeof CHARS_PER_SECOND;

/** Characters that fit in `maxSpeechSeconds` of speech, with 10% headroom. */
export function textBudgetFor(language: Language): number {
  return Math.min(
    CREATE_LIMITS.maxTextChars,
    Math.floor(CREATE_LIMITS.maxSpeechSeconds * CHARS_PER_SECOND[language] * 0.9),
  );
}

/** Measure audio duration in the browser via a temporary object URL. */
export function measureAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const cleanup = () => {
      URL.revokeObjectURL(url);
      audio.removeAttribute('src');
      audio.load();
    };

    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      cleanup();
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error('Could not read voice-sample duration'));
        return;
      }
      resolve(duration);
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error('Could not read voice-sample duration'));
    };
    audio.src = url;
  });
}

export function validateCreateInput(input: {
  image: File | null;
  audio: File | null;
  refText: string;
  text: string;
  language: Language;
  audioSeconds?: number;
}): string | null {
  if (!input.image) return 'Please choose a photo.';
  if (!input.audio) return 'Please choose a voice sample.';

  const refText = input.refText.trim();
  const text = input.text.trim();
  if (!refText) return 'Please enter the transcript of the voice sample.';
  if (!text) return 'Please enter a farewell message.';

  if (refText.length > CREATE_LIMITS.maxRefTextChars) {
    return `Transcript must be at most ${CREATE_LIMITS.maxRefTextChars} characters.`;
  }
  const textBudget = textBudgetFor(input.language);
  if (text.length > textBudget) {
    return `Farewell message must be at most ${textBudget} characters — the video can only be ${CREATE_LIMITS.maxSpeechSeconds}s long.`;
  }

  if (input.audioSeconds !== undefined) {
    if (input.audioSeconds < CREATE_LIMITS.minAudioSeconds) {
      return `Voice sample is too short (${input.audioSeconds.toFixed(1)}s). Use at least ${CREATE_LIMITS.minAudioSeconds}s.`;
    }
    if (input.audioSeconds > CREATE_LIMITS.maxAudioSeconds) {
      return `Voice sample is too long (${input.audioSeconds.toFixed(1)}s). Keep it under ${CREATE_LIMITS.maxAudioSeconds}s.`;
    }
  }

  return null;
}

/**
 * Read duration from a PCM/float WAV header. Returns null for non-WAV or
 * containers we cannot parse without a decoder (mp3/m4a).
 */
export function wavDurationSeconds(buf: Buffer): number | null {
  if (buf.length < 44) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    return null;
  }

  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataSize = 0;

  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const start = offset + 8;

    if (id === 'fmt ' && start + 16 <= buf.length) {
      channels = buf.readUInt16LE(start + 2);
      sampleRate = buf.readUInt32LE(start + 4);
      bitsPerSample = buf.readUInt16LE(start + 14);
    } else if (id === 'data') {
      // DashScope streams TTS output, so its header declares a placeholder
      // data size (~2 GB). Trust the bytes we actually hold when the header
      // over-promises, otherwise every clip looks 12 hours long.
      dataSize = Math.min(size, buf.length - start);
      break;
    }

    offset = start + size + (size % 2); // chunks are word-aligned
  }

  if (!sampleRate || !channels || !bitsPerSample || !dataSize) return null;
  const bytesPerSample = (bitsPerSample / 8) * channels;
  if (bytesPerSample <= 0) return null;
  return dataSize / (sampleRate * bytesPerSample);
}

// ~12 English chars/sec of speech; Chinese is denser (~4 chars/sec of CJK).
const CHARS_PER_SECOND = { English: 12, Chinese: 4 } as const;

/** Rough spoken duration estimate when we cannot measure the audio container. */
export function estimateSpeechSeconds(text: string, language: 'English' | 'Chinese'): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.length / CHARS_PER_SECOND[language];
}

/**
 * Inverse of {@link estimateSpeechSeconds}: how much text fits a video length.
 * Keeps 10% headroom, since the real TTS rate varies and overshooting the cap
 * means the video ends mid-sentence.
 */
export function textBudgetFor(seconds: number, language: 'English' | 'Chinese'): number {
  return Math.floor(seconds * CHARS_PER_SECOND[language] * 0.9);
}

/** Clamp a measured/estimated duration into the Wan i2v window. */
export function clampVideoDuration(
  seconds: number,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.ceil(seconds)));
}

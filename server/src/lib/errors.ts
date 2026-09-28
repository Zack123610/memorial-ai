/**
 * Map raw downstream / DashScope errors into short messages suitable for the UI.
 * Keeps technical detail in logs; users see actionable guidance.
 */
export function friendlyPipelineError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (
    lower.includes('face') ||
    lower.includes('no person') ||
    lower.includes('portrait') ||
    lower.includes('detect')
  ) {
    return 'Could not use this photo — please upload a clear, front-facing portrait of one person.';
  }

  if (
    lower.includes('ref_audio') ||
    lower.includes('reference') ||
    lower.includes('audio duration') ||
    lower.includes('too short') ||
    lower.includes('too long') ||
    lower.includes('mismatched') ||
    lower.includes('fallback')
  ) {
    return 'Voice sample was rejected — use 3–60s of clean speech that matches the transcript.';
  }

  if (lower.includes('timed out') || lower.includes('timeout')) {
    return 'Generation timed out. Please try again in a moment.';
  }

  if (
    lower.includes('econnrefused') ||
    lower.includes('fetch failed') ||
    lower.includes('503') ||
    lower.includes('not configured')
  ) {
    return 'An AI service is unavailable. Check that tts-service and video-service are running.';
  }

  if (lower.includes('413') || lower.includes('too large') || lower.includes('file size')) {
    return 'Upload is too large. Try a smaller photo or shorter voice sample.';
  }

  // Cap very long DashScope dumps so the UI stays readable.
  if (raw.length > 280) return `${raw.slice(0, 277)}…`;
  return raw;
}

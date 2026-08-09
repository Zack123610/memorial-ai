import { config } from '../config/env.js';

export type TtsLanguage = 'English' | 'Chinese';

export interface TtsCloneInput {
  refAudio: Blob | Buffer;
  refAudioFilename?: string;
  refAudioMimeType?: string;
  refText: string;
  text: string;
  language?: TtsLanguage;
}

export interface TtsCloneOutput {
  audio: Buffer;
  contentType: string;
  sampleRate: number;
  elapsedSeconds: number;
  refDurationSeconds: number;
  language: TtsLanguage;
  /** DashScope voice the speech was rendered with, and whether it was reused. */
  voice: string | null;
  voiceCached: boolean;
}

export interface TtsHealth {
  status: string;
  provider: string;
  model: string;
  enrollmentModel: string;
  apiKeyConfigured: boolean;
  cachedVoices: number;
}

export class TtsServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'TtsServiceError';
  }
}

export class TtsClient {
  constructor(private readonly baseUrl: string = config.ttsServiceUrl) {}

  async health(): Promise<TtsHealth> {
    const res = await fetch(`${this.baseUrl}/health`);
    if (!res.ok) throw new TtsServiceError(await res.text(), res.status);
    const json = (await res.json()) as {
      status: string;
      provider: string;
      model: string;
      enrollment_model: string;
      api_key_configured: boolean;
      cached_voices: number;
    };
    return {
      status: json.status,
      provider: json.provider,
      model: json.model,
      enrollmentModel: json.enrollment_model,
      apiKeyConfigured: json.api_key_configured,
      cachedVoices: json.cached_voices,
    };
  }

  async clone(input: TtsCloneInput): Promise<TtsCloneOutput> {
    const form = new FormData();
    const blob =
      input.refAudio instanceof Blob
        ? input.refAudio
        : new Blob([input.refAudio], { type: input.refAudioMimeType ?? 'audio/wav' });
    form.append('ref_audio', blob, input.refAudioFilename ?? 'ref.wav');
    form.append('ref_text', input.refText);
    form.append('text', input.text);
    form.append('language', input.language ?? 'English');

    const res = await fetch(`${this.baseUrl}/clone`, { method: 'POST', body: form });
    if (!res.ok) {
      const detail = await res.text().catch(() => '<no body>');
      throw new TtsServiceError(`tts-service ${res.status}: ${detail}`, res.status);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    return {
      audio: buf,
      contentType: res.headers.get('Content-Type')?.split(';')[0] ?? 'audio/wav',
      sampleRate: Number(res.headers.get('X-Sample-Rate') ?? 0),
      elapsedSeconds: Number(res.headers.get('X-Elapsed-Seconds') ?? 0),
      refDurationSeconds: Number(res.headers.get('X-Ref-Duration-Seconds') ?? 0),
      language: (res.headers.get('X-Language') as TtsLanguage) ?? 'English',
      voice: res.headers.get('X-Voice'),
      voiceCached: res.headers.get('X-Voice-Cached') === 'true',
    };
  }
}

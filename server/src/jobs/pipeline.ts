import { config } from '../config/env.js';
import { clampVideoDuration, estimateSpeechSeconds, wavDurationSeconds } from '../lib/audio.js';
import { friendlyPipelineError } from '../lib/errors.js';
import type { TtsClient, TtsLanguage } from '../services/tts.js';
import type { VideoClient } from '../services/video.js';
import type { JobStore } from './store.js';

/** Fixed scene/motion prompt for the talking-head video (Wan2.7 i2v). */
const DEFAULT_VIDEO_PROMPT =
  'A person speaking warmly and calmly to the camera, gentle natural head movement, soft even lighting. Clear frontal face, natural lip sync with the audio.';

const AUDIO_EXTENSIONS: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
};

export interface UploadedFile {
  buffer: Buffer;
  filename: string;
  mimetype: string;
}

export interface PipelineInput {
  image: UploadedFile;
  audio: UploadedFile;
  refText: string;
  text: string;
  language: TtsLanguage;
}

export interface PipelineDeps {
  store: JobStore;
  tts: TtsClient;
  video: VideoClient;
}

function videoDurationFor(clonedAudio: Buffer, text: string, language: TtsLanguage): number {
  const measured = wavDurationSeconds(clonedAudio);
  const estimated = estimateSpeechSeconds(text, language);
  const seconds = measured ?? estimated;
  return clampVideoDuration(
    seconds,
    config.video.minDuration,
    config.video.maxDuration,
    config.video.defaultDuration,
  );
}

/**
 * Runs a generation job end-to-end: clone the voice, hand the photo + cloned
 * audio to the video service, and poll until the video is ready. Updates the
 * job store (which emits progress over Socket.IO) at each stage.
 */
export async function runPipeline(
  jobId: string,
  input: PipelineInput,
  { store, tts, video }: PipelineDeps,
): Promise<void> {
  try {
    store.update(jobId, { status: 'voice_cloning', detail: 'Cloning voice' });
    const cloned = await tts.clone({
      refAudio: input.audio.buffer,
      refAudioFilename: input.audio.filename,
      refAudioMimeType: input.audio.mimetype,
      refText: input.refText,
      text: input.text,
      language: input.language,
    });

    const duration = videoDurationFor(cloned.audio, input.text, input.language);
    store.update(jobId, {
      status: 'video_generating',
      detail: `Submitting to video service (${duration}s @ ${config.video.resolution})`,
    });

    const clonedExt = AUDIO_EXTENSIONS[cloned.contentType] ?? 'wav';
    const { jobId: videoJobId } = await video.submit({
      image: input.image.buffer,
      imageFilename: input.image.filename,
      imageMimeType: input.image.mimetype,
      audio: cloned.audio,
      audioFilename: `cloned.${clonedExt}`,
      audioMimeType: cloned.contentType,
      prompt: DEFAULT_VIDEO_PROMPT,
      resolution: config.video.resolution,
      duration,
      promptExtend: config.video.promptExtend,
      watermark: config.video.watermark,
    });

    const { videoUrl } = await video.waitForCompletion(videoJobId, (detail) =>
      store.update(jobId, { detail }),
    );

    store.update(jobId, { status: 'completed', detail: null, videoUrl });
  } catch (err) {
    console.error(`[pipeline] job ${jobId} failed:`, err);
    store.update(jobId, {
      status: 'failed',
      error: friendlyPipelineError(err),
    });
  }
}

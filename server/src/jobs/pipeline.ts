import { config } from '../config/env.js';
import { clampVideoDuration, estimateSpeechSeconds, wavDurationSeconds } from '../lib/audio.js';
import { friendlyPipelineError } from '../lib/errors.js';
import type { TtsClient, TtsLanguage } from '../services/tts.js';
import type { VideoClient } from '../services/video.js';
import type { JobStore } from './store.js';

/** Fixed scene/motion prompt for the talking-head video (Wan i2v). */
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
  deps: PipelineDeps,
): Promise<void> {
  const { store, tts, video } = deps;
  try {
    await store.update(jobId, { status: 'voice_cloning', detail: 'Cloning voice' });
    const cloned = await tts.clone({
      refAudio: input.audio.buffer,
      refAudioFilename: input.audio.filename,
      refAudioMimeType: input.audio.mimetype,
      refText: input.refText,
      text: input.text,
      language: input.language,
    });

    const duration = videoDurationFor(cloned.audio, input.text, input.language);
    await store.update(jobId, {
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
      externalId: jobId,
    });

    // Recorded before polling starts so a restart can pick the job back up.
    await store.update(jobId, { videoJobId });

    await awaitVideo(jobId, videoJobId, deps);
  } catch (err) {
    await failJob(jobId, err, deps);
  }
}

/**
 * Re-attaches to a job that was already handed to the video service before the
 * process stopped. Generation runs on DashScope, so the result is usually still
 * waiting to be collected.
 */
export async function resumePipeline(
  jobId: string,
  videoJobId: string,
  deps: PipelineDeps,
): Promise<void> {
  try {
    await deps.store.update(jobId, {
      status: 'video_generating',
      detail: 'Reconnecting to video service after a restart',
    });
    await awaitVideo(jobId, videoJobId, deps);
  } catch (err) {
    await failJob(jobId, err, deps);
  }
}

async function awaitVideo(
  jobId: string,
  videoJobId: string,
  { store, video }: PipelineDeps,
): Promise<void> {
  const { videoUrl, imageUrl, audioUrl } = await video.waitForCompletion(videoJobId, (detail) => {
    void store.update(jobId, { detail });
  });

  await store.update(jobId, {
    status: 'completed',
    detail: null,
    videoUrl,
    imageUrl,
    audioUrl,
  });
}

async function failJob(jobId: string, err: unknown, { store }: PipelineDeps): Promise<void> {
  console.error(`[pipeline] job ${jobId} failed:`, err);
  await store.update(jobId, {
    status: 'failed',
    error: friendlyPipelineError(err),
  });
}

import {
  MIME_TYPE,
  SOURCE_BUFFER_REMOVE_BEHIND_SECONDS,
} from "./audio-constants";

export function isMediaSourceSupported(): boolean {
  return (
    typeof MediaSource !== "undefined" && MediaSource.isTypeSupported(MIME_TYPE)
  );
}

export function createMediaSourceUrl(): {
  mediaSource: MediaSource;
  objectUrl: string;
} {
  const mediaSource = new MediaSource();
  const objectUrl = URL.createObjectURL(mediaSource);

  return {
    mediaSource,
    objectUrl,
  };
}

export function appendNextChunk(params: {
  sourceBuffer: SourceBuffer | null;
  mediaSource: MediaSource | null;
  pendingChunks: ArrayBuffer[];
  isStalled: () => boolean;
  markStalled: () => void;
}): void {
  const { sourceBuffer, mediaSource, pendingChunks, isStalled, markStalled } =
    params;

  if (!sourceBuffer) return;
  if (sourceBuffer.updating) return;
  if (pendingChunks.length === 0) return;
  if (isStalled()) return;
  if (mediaSource?.readyState !== "open") return;

  const chunk = pendingChunks.shift();

  if (!chunk) return;

  try {
    sourceBuffer.appendBuffer(chunk);
  } catch (err) {
    pendingChunks.length = 0;
    markStalled();
    console.error("appendBuffer failed:", err);
  }
}

export function cleanSourceBufferOldData(params: {
  sourceBuffer: SourceBuffer | null;
  audio: HTMLAudioElement | null;
}): void {
  const { sourceBuffer, audio } = params;

  if (!sourceBuffer || sourceBuffer.updating || !audio) return;

  try {
    if (sourceBuffer.buffered.length === 0) return;

    const start = sourceBuffer.buffered.start(0);
    const removeEnd = audio.currentTime - SOURCE_BUFFER_REMOVE_BEHIND_SECONDS;

    if (removeEnd > start) {
      sourceBuffer.remove(start, removeEnd);
    }
  } catch (err) {
    console.warn("Cannot clean old source buffer data:", err);
  }
}

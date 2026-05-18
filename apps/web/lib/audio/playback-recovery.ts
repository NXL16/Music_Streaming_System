import type { StreamDataResponse } from "@/lib/api";
import { UNSTALL_OFFSET_SECONDS } from "./audio-constants";
import { getSegmentIndexForTime } from "./segment-utils";

export function hasBufferedCurrentTime(
  audio: HTMLAudioElement,
  sourceBuffer: SourceBuffer,
): boolean {
  let buffered: TimeRanges;

  try {
    buffered = sourceBuffer.buffered;
  } catch {
    return false;
  }

  for (let i = 0; i < buffered.length; i += 1) {
    const start = buffered.start(i);
    const end = buffered.end(i);

    if (audio.currentTime >= start && audio.currentTime <= end) {
      return true;
    }
  }

  return false;
}

export function recoverFromPlaybackStall(params: {
  audio: HTMLAudioElement;
  sourceBuffer: SourceBuffer;
  meta: StreamDataResponse;
  isSeeking: boolean;
  setPendingSeekTime: (time: number) => void;
  resetPipeline: (segmentIndex: number) => void;
}): void {
  const {
    audio,
    sourceBuffer,
    meta,
    isSeeking,
    setPendingSeekTime,
    resetPipeline,
  } = params;

  if (isSeeking) return;

  const hasBufferAhead = hasBufferedCurrentTime(audio, sourceBuffer);

  if (!hasBufferAhead) {
    const currentTime = Math.max(
      0,
      Math.min(meta.duration || 0, audio.currentTime),
    );

    const targetSegmentIndex = getSegmentIndexForTime(meta, currentTime);

    setPendingSeekTime(currentTime);
    resetPipeline(targetSegmentIndex);

    return;
  }

  audio.currentTime += UNSTALL_OFFSET_SECONDS;
}

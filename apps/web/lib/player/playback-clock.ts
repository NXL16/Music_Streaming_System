type PlaybackClockSource = Pick<HTMLMediaElement, "currentTime">;

export function playbackTimeMsFromSeconds(seconds: number): number {
  return Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds * 1000)) : 0;
}

export function syncPlaybackClock(
  audio: PlaybackClockSource,
  setPlaybackTimeMs: (timeMs: number) => void,
): void {
  setPlaybackTimeMs(playbackTimeMsFromSeconds(audio.currentTime));
}

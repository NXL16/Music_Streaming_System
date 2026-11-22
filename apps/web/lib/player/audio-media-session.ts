import type { PlaybackAudio } from "./playback-audio";

type Session = Pick<MediaSession, "playbackState" | "setPositionState">;
type Options = {
  isPlaying: () => boolean;
};

export function bindAudioMediaSession(
  session: Session,
  audio: PlaybackAudio,
  options: Options,
) {
  let disposed = false;
  const sync = () => {
    if (disposed) return;
    const state = options.isPlaying() ? "playing" : "paused";
    if (session.playbackState !== state) session.playbackState = state;
    const { duration, currentTime, playbackRate } = audio;
    if (
      !Number.isFinite(duration) ||
      duration <= 0 ||
      !Number.isFinite(currentTime)
    )
      return;
    try {
      session.setPositionState?.({
        duration,
        position: Math.max(0, Math.min(currentTime, duration)),
        playbackRate,
      });
    } catch {
      /* Position state is optional on some platforms. */
    }
  };
  const events = [
    "loadedmetadata",
    "durationchange",
    "timeupdate",
    "play",
    "playing",
    "pause",
    "ended",
    "seeking",
    "seeked",
    "ratechange",
  ];
  for (const event of events) audio.addEventListener(event, sync);
  sync();
  return {
    sync,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const event of events) audio.removeEventListener(event, sync);
    },
  };
}

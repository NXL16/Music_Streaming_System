type VideoPlaybackEvent =
  | { type: "timeupdate"; src: string; currentTime: number; duration: number }
  | { type: "ended"; src: string };

type Listener = (event: VideoPlaybackEvent) => void;

let videoElement: HTMLVideoElement | null = null;
let desiredVolume: number | null = null;
let desiredPlaybackRate: number | null = null;
const listeners = new Set<Listener>();

function publish(event: VideoPlaybackEvent) {
  for (const listener of listeners) listener(event);
}

/** The single imperative boundary between video media and player UI. */
export const videoPlaybackController = {
  attach(video: HTMLVideoElement) {
    videoElement = video;
    if (desiredVolume !== null) video.volume = desiredVolume;
    if (desiredPlaybackRate !== null) video.playbackRate = desiredPlaybackRate;
    return () => {
      if (videoElement === video) videoElement = null;
    };
  },
  seek(time: number) {
    const video = videoElement;
    if (!video || !Number.isFinite(time) || !Number.isFinite(video.duration)) {
      return;
    }
    video.currentTime = Math.max(0, Math.min(video.duration, time));
  },
  play() {
    const video = videoElement;
    if (!video) return Promise.resolve(false);
    return video.play().then(
      () => true,
      () => false,
    );
  },
  pause() {
    videoElement?.pause();
  },
  setVolume(volume: number) {
    if (!Number.isFinite(volume)) return;
    desiredVolume = Math.min(1, Math.max(0, volume));
    if (videoElement) videoElement.volume = desiredVolume;
  },
  setPlaybackRate(rate: number) {
    if (!Number.isFinite(rate)) return;
    desiredPlaybackRate = Math.min(2, Math.max(0.5, rate));
    if (videoElement) videoElement.playbackRate = desiredPlaybackRate;
  },
  publishTime(src: string, currentTime: number, duration: number) {
    publish({ type: "timeupdate", src, currentTime, duration });
  },
  publishEnded(src: string) {
    publish({ type: "ended", src });
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

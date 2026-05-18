export type PlaybackState =
  | "idle"
  | "loading"
  | "buffering"
  | "seeking"
  | "playing"
  | "paused"
  | "stalled";

export interface AudioEngineOptions {
  onProgress: (progress: number) => void;
  onDuration?: (duration: number) => void;
  onEnded?: () => void;
  onError?: (error: unknown) => void;
}

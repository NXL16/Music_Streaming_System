export interface PlaybackAudio extends EventTarget {
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  readonly ended: boolean;
  readonly seeking: boolean;
  readonly readyState: number;
  readonly networkState: number;
  readonly buffered: TimeRanges;
  readonly error: { code: number; message: string } | null;
  readonly dataset: DOMStringMap;
  playbackRate: number;
  defaultPlaybackRate: number;
  preservesPitch: boolean;
  volume: number;
  play(): Promise<void>;
  pause(): void;
  setVocalVolume?(value: number): void;
}

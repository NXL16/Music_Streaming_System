export type StreamInfo = {
  streamUrl: string;
  key: string;
  iv: string;
};

export type SegmentInfo = {
  startByte: number;
  size: number;
  duration: number;
  startTimeSec: number;
};

export type StreamMetadata = {
  songId: string;
  variant?: "instrumental" | "vocal";
  duration: number;
  offset: number;
  timescale: number;
  initRange: { start: number; end: number };
  segments: SegmentInfo[];
  encryptionStartOffset: number;
  waveform: number[];
};

export type StemPlayback = StreamInfo & {
  metadata: StreamMetadata;
};

export type StandardPlaybackManifest = {
  mode: "STANDARD";
  main: StemPlayback;
};

export type SingPlaybackManifest = {
  mode: "SING";
  instrumental: StemPlayback;
  vocal: StemPlayback;
};

export type PlaybackManifest =
  | StandardPlaybackManifest
  | SingPlaybackManifest;

export type AttachedStream = {
  streamInfo: StreamInfo;
  metadata: StreamMetadata;
};

export type PreloadedSong = {
  songId: string;
  streamInfo: StreamInfo;
  metadata: StreamMetadata;
  cryptoKey: CryptoKey;
  ivBytes: Uint8Array;
  initSegment: ArrayBuffer;
  firstSegmentsBatch: ArrayBuffer;
  preloadedCount: number;
};

export type PreloadedPlayback =
  | {
      mode: "STANDARD";
      main: PreloadedSong;
    }
  | {
      mode: "SING";
      instrumental: PreloadedSong;
      vocal: PreloadedSong;
    };

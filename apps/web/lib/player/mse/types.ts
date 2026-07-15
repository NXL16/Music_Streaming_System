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
  duration: number;
  offset: number;
  timescale: number;
  initRange: { start: number; end: number };
  segments: SegmentInfo[];
  encryptionStartOffset: number;
  waveform: number[];
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

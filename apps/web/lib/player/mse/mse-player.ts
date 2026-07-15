import { getStreamInfo, getStreamMetadata } from "../stream.api";
import { decryptChunk, importAesKey, hexToBytes } from "./crypto";
import { fetchRange } from "./fetcher";
import type { PreloadedSong, SegmentInfo, StreamMetadata } from "./types";

const MIME = 'audio/mp4; codecs="mp4a.40.2"';
const INITIAL_BATCH = 2;
const SEEK_BATCH = 2;
const BATCH_SIZE = 10;
const BUFFER_GOAL_SEC = 30;
const BUFFER_LOW_SEC = 15;

function findSegmentIndex(segments: SegmentInfo[], timeSec: number): number {
  let lo = 0;
  let hi = segments.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (segments[mid].startTimeSec <= timeSec) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function waitForUpdateEnd(sb: SourceBuffer): Promise<void> {
  if (!sb.updating) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onDone = () => {
      sb.removeEventListener("updateend", onDone);
      sb.removeEventListener("error", onErr);
      resolve();
    };
    const onErr = () => {
      sb.removeEventListener("updateend", onDone);
      sb.removeEventListener("error", onErr);
      reject(new Error("SourceBuffer error"));
    };
    sb.addEventListener("updateend", onDone);
    sb.addEventListener("error", onErr);
  });
}

function waitForSourceOpen(ms: MediaSource): Promise<void> {
  if (ms.readyState === "open") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onOpen = () => {
      ms.removeEventListener("sourceopen", onOpen);
      resolve();
    };
    const onClose = () => {
      ms.removeEventListener("sourceopen", onOpen);
      ms.removeEventListener("sourceclose", onClose);
      reject(new Error("MediaSource closed before opening"));
    };
    ms.addEventListener("sourceopen", onOpen, { once: true });
    ms.addEventListener("sourceclose", onClose, { once: true });
  });
}

export class MsePlayer {
  private audio: HTMLAudioElement | null = null;
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private objectUrl: string | null = null;

  private metadata: StreamMetadata | null = null;
  private streamUrl: string | null = null;
  private cryptoKey: CryptoKey | null = null;
  private ivBytes: Uint8Array | null = null;
  private initSegment: ArrayBuffer | null = null;

  private appendedSegments = new Set<number>();
  // After a seek, segments before this point are intentionally not fetched.
  // End-of-stream therefore depends on a contiguous playable tail, rather
  // than every segment from the beginning of the song.
  private requiredTailStartIndex = 0;
  private abortController: AbortController | null = null;
  private downloading = false;
  private disposed = false;
  private fillGeneration = 0;
  private needsUrgentFill = false;

  private appendQueue: ArrayBuffer[] = [];
  private flushing = false;

  async attach(
    audio: HTMLAudioElement,
    songId: string,
    preloaded?: PreloadedSong,
  ): Promise<void> {
    this.disposed = false;
    this.audio = audio;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    let firstBatch: ArrayBuffer | null = null;
    let firstBatchCount = 0;

    if (preloaded) {
      this.streamUrl = preloaded.streamInfo.streamUrl;
      this.cryptoKey = preloaded.cryptoKey;
      this.ivBytes = preloaded.ivBytes;
      this.metadata = preloaded.metadata;
      this.initSegment = preloaded.initSegment;
      firstBatch =
        preloaded.preloadedCount > 0
          ? preloaded.firstSegmentsBatch
          : null;
      firstBatchCount = preloaded.preloadedCount;
    } else {
      const [streamInfo, metadata] = await Promise.all([
        getStreamInfo(songId),
        getStreamMetadata(songId),
      ]);
      if (this.disposed) return;

      this.streamUrl = streamInfo.streamUrl;
      this.cryptoKey = await importAesKey(streamInfo.key);
      this.ivBytes = hexToBytes(streamInfo.iv);
      this.metadata = metadata;

      const segments = metadata.segments;
      const initEnd = metadata.initRange.end;
      firstBatchCount = Math.min(INITIAL_BATCH, segments.length);

      let fetchEnd: number;
      if (firstBatchCount > 0) {
        const lastSeg = segments[firstBatchCount - 1];
        fetchEnd = lastSeg.startByte + lastSeg.size - 1;
      } else {
        fetchEnd = initEnd;
      }

      const cipher = await fetchRange(this.streamUrl, 0, fetchEnd, signal);
      if (this.disposed) return;

      const plain = await decryptChunk(
        this.cryptoKey,
        this.ivBytes,
        cipher,
        0,
      );
      if (this.disposed) return;

      this.initSegment = plain.slice(0, initEnd + 1);
      if (firstBatchCount > 0) {
        firstBatch = plain.slice(initEnd + 1);
      }
    }

    if (this.disposed) return;

    this.mediaSource = new MediaSource();
    this.objectUrl = URL.createObjectURL(this.mediaSource);
    audio.src = this.objectUrl;

    await waitForSourceOpen(this.mediaSource);
    if (this.disposed) return;

    this.sourceBuffer = this.mediaSource.addSourceBuffer(MIME);
    this.sourceBuffer.mode = "segments";

    await this.appendBuffer(this.initSegment!);
    if (this.disposed) return;

    if (firstBatch) {
      await this.appendBuffer(firstBatch);
      for (let i = 0; i < firstBatchCount; i++) {
        this.appendedSegments.add(i);
      }
    }

    if (this.disposed) return;

    this.mediaSource.duration = this.metadata!.duration;

    audio.addEventListener("seeking", this.onSeeking);
    audio.addEventListener("timeupdate", this.onTimeUpdate);

    this.fillBuffer();
  }

  detach(): void {
    this.disposed = true;
    this.abortController?.abort();
    this.abortController = null;

    if (this.audio) {
      this.audio.removeEventListener("seeking", this.onSeeking);
      this.audio.removeEventListener("timeupdate", this.onTimeUpdate);
      this.audio.removeAttribute("src");
      this.audio.load();
      this.audio = null;
    }

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }

    if (
      this.mediaSource &&
      this.mediaSource.readyState === "open"
    ) {
      try {
        if (this.sourceBuffer?.updating) {
          this.sourceBuffer.abort();
        }
        if (this.sourceBuffer) {
          this.mediaSource.removeSourceBuffer(this.sourceBuffer);
        }
        this.mediaSource.endOfStream();
      } catch {
        /* already closed */
      }
    }
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.metadata = null;
    this.streamUrl = null;
    this.cryptoKey = null;
    this.ivBytes = null;
    this.initSegment = null;
    this.appendedSegments.clear();
    this.requiredTailStartIndex = 0;
    this.downloading = false;
    this.fillGeneration = 0;
    this.needsUrgentFill = false;
    this.appendQueue = [];
    this.flushing = false;
  }

  private onSeeking = (): void => {
    if (!this.audio || !this.metadata) return;
    const targetTime = this.audio.currentTime;
    const targetIndex = findSegmentIndex(this.metadata.segments, targetTime);

    if (this.isTimeBuffered(targetTime)) {
      this.requiredTailStartIndex = Math.min(
        this.requiredTailStartIndex,
        targetIndex,
      );
      if (!this.downloading && this.getBufferAhead() < BUFFER_LOW_SEC) {
        this.fillBuffer();
      }
      return;
    }

    this.requiredTailStartIndex = targetIndex;
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.downloading = false;
    this.fillGeneration++;
    this.needsUrgentFill = true;
    this.fillBuffer();
  };

  private onTimeUpdate = (): void => {
    if (this.disposed) return;
    this.tryEndOfStream();
    if (this.downloading) return;
    if (this.getBufferAhead() < BUFFER_LOW_SEC) {
      this.fillBuffer();
    }
  };

  private getBufferAhead(): number {
    if (!this.audio) return 0;
    const ct = this.audio.currentTime;
    const buf = this.audio.buffered;
    for (let i = 0; i < buf.length; i++) {
      if (ct >= buf.start(i) - 0.1 && ct <= buf.end(i)) {
        return buf.end(i) - ct;
      }
    }
    return 0;
  }

  private async fetchAndAppendBatch(
    startIdx: number,
    count: number,
    signal: AbortSignal,
  ): Promise<void> {
    const segments = this.metadata!.segments;
    const endIdx = Math.min(startIdx + count, segments.length);

    let from = startIdx;
    while (from < endIdx && this.appendedSegments.has(from)) from++;
    if (from >= endIdx) return;

    let to = from + 1;
    while (to < endIdx && !this.appendedSegments.has(to)) to++;

    const firstSeg = segments[from];
    const lastSeg = segments[to - 1];

    const cipher = await fetchRange(
      this.streamUrl!,
      firstSeg.startByte,
      lastSeg.startByte + lastSeg.size - 1,
      signal,
    );
    if (this.disposed || signal.aborted) return;

    const plain = await decryptChunk(
      this.cryptoKey!,
      this.ivBytes!,
      cipher,
      firstSeg.startByte,
    );
    if (this.disposed || signal.aborted) return;

    await this.appendBuffer(plain);
    for (let i = from; i < to; i++) this.appendedSegments.add(i);
  }

  private async fillBuffer(): Promise<void> {
    if (this.downloading || this.disposed || !this.audio || !this.metadata)
      return;
    this.downloading = true;
    const gen = this.fillGeneration;

    const segments = this.metadata.segments;
    const signal = this.abortController!.signal;

    try {
      while (!this.disposed && gen === this.fillGeneration) {
        const targetIdx = Math.min(
          findSegmentIndex(
            segments,
            this.audio!.currentTime + BUFFER_GOAL_SEC,
          ),
          segments.length - 1,
        );

        const fromIdx = findSegmentIndex(segments, this.audio!.currentTime);
        let cursor = fromIdx;
        while (cursor <= targetIdx && this.appendedSegments.has(cursor)) {
          cursor++;
        }

        if (cursor > targetIdx) break;

        const size = this.needsUrgentFill ? SEEK_BATCH : BATCH_SIZE;
        this.needsUrgentFill = false;
        const batchCount = Math.min(size, segments.length - cursor);
        await this.fetchAndAppendBatch(cursor, batchCount, signal);
      }
    } catch {
      /* fetch aborted or failed */
    }

    if (gen !== this.fillGeneration) return;
    this.downloading = false;

    this.tryEndOfStream();
  }

  private tryEndOfStream(): void {
    if (this.disposed || !this.metadata) return;
    if (this.mediaSource?.readyState !== "open") return;

    const lastSegmentIndex = this.metadata.segments.length - 1;
    for (
      let index = this.requiredTailStartIndex;
      index <= lastSegmentIndex;
      index += 1
    ) {
      if (!this.appendedSegments.has(index)) return;
    }

    try {
      this.mediaSource.endOfStream();
    } catch {
      /* ignore */
    }
  }

  private isTimeBuffered(time: number): boolean {
    if (!this.audio) return false;
    const buffered = this.audio.buffered;
    for (let i = 0; i < buffered.length; i++) {
      if (time >= buffered.start(i) && time <= buffered.end(i)) return true;
    }
    return false;
  }

  private async appendBuffer(data: ArrayBuffer): Promise<void> {
    if (!this.sourceBuffer || this.disposed) return;

    this.appendQueue.push(data);
    if (this.flushing) return;

    this.flushing = true;
    while (this.appendQueue.length > 0 && !this.disposed) {
      const buf = this.appendQueue.shift()!;
      this.sourceBuffer.appendBuffer(buf);
      await waitForUpdateEnd(this.sourceBuffer);
    }
    this.flushing = false;
  }
}

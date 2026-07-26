import { getStreamInfo, getStreamMetadata } from "../stream.api";
import { decryptChunk, hexToBytes, importAesKey } from "./crypto";
import { fetchRange } from "./fetcher";
import type { PreloadedSong, SegmentInfo, StreamMetadata } from "./types";

const MIME = 'audio/mp4; codecs="mp4a.40.2"';
const INITIAL_BATCH = 2;
const SEEK_BATCH = 1;
const BUFFER_BATCH_BYTES = 256 * 1024;
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

function getBatchSegmentCount(
  segments: SegmentInfo[],
  startIndex: number,
  byteBudget: number,
): number {
  let totalBytes = 0;
  let count = 0;

  while (startIndex + count < segments.length) {
    const segmentSize = segments[startIndex + count].size;
    if (count > 0 && totalBytes + segmentSize > byteBudget) break;

    totalBytes += segmentSize;
    count += 1;
    if (totalBytes >= byteBudget) break;
  }

  return count;
}

function waitForUpdateEnd(sourceBuffer: SourceBuffer): Promise<void> {
  if (!sourceBuffer.updating) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      sourceBuffer.removeEventListener("updateend", onUpdateEnd);
      sourceBuffer.removeEventListener("error", onError);
      sourceBuffer.removeEventListener("abort", onAbort);
    };
    const onUpdateEnd = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("SourceBuffer error"));
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("SourceBuffer update aborted", "AbortError"));
    };

    sourceBuffer.addEventListener("updateend", onUpdateEnd);
    sourceBuffer.addEventListener("error", onError);
    sourceBuffer.addEventListener("abort", onAbort);
  });
}

function waitForSourceOpen(mediaSource: MediaSource): Promise<void> {
  if (mediaSource.readyState === "open") return Promise.resolve();

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      mediaSource.removeEventListener("sourceopen", onOpen);
      mediaSource.removeEventListener("sourceclose", onClose);
    };
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(new Error("MediaSource closed before opening"));
    };

    mediaSource.addEventListener("sourceopen", onOpen, { once: true });
    mediaSource.addEventListener("sourceclose", onClose, { once: true });
  });
}

export abstract class SegmentedMediaPlayer {
  private audio: HTMLAudioElement | null = null;
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private objectUrl: string | null = null;

  private metadata: StreamMetadata | null = null;
  private streamUrl: string | null = null;
  private cryptoKey: CryptoKey | null = null;
  private ivBytes: Uint8Array | null = null;

  private appendedSegments = new Set<number>();
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

    const initialData = await this.loadInitialData(songId, preloaded);
    if (this.disposed) return;

    this.mediaSource = this.createMediaSource();
    this.onMediaSourceCreated(this.mediaSource);
    this.prepareAudio(audio);
    this.objectUrl = URL.createObjectURL(this.mediaSource);
    audio.src = this.objectUrl;

    await waitForSourceOpen(this.mediaSource);
    if (this.disposed) return;

    this.sourceBuffer = this.mediaSource.addSourceBuffer(MIME);
    this.sourceBuffer.mode = "segments";

    await this.appendBuffer(initialData.initSegment);
    if (this.disposed) return;

    if (initialData.firstSegmentsBatch.byteLength > 0) {
      await this.appendBuffer(initialData.firstSegmentsBatch);
      for (let index = 0; index < initialData.preloadedCount; index += 1) {
        this.appendedSegments.add(index);
      }
    }

    if (this.disposed || !this.metadata) return;

    this.mediaSource.duration = this.metadata.duration;
    audio.addEventListener("seeking", this.onSeeking);
    audio.addEventListener("timeupdate", this.onTimeUpdate);
    this.fillBuffer();
  }

  detach(): void {
    this.disposed = true;
    this.cancelFetching();

    const audio = this.audio;
    if (audio) {
      audio.removeEventListener("seeking", this.onSeeking);
      audio.removeEventListener("timeupdate", this.onTimeUpdate);
      this.restoreAudio(audio);
      audio.removeAttribute("src");
      audio.load();
      this.audio = null;
    }

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }

    if (this.mediaSource?.readyState === "open") {
      try {
        if (this.sourceBuffer?.updating) this.sourceBuffer.abort();
        if (this.sourceBuffer) this.mediaSource.removeSourceBuffer(this.sourceBuffer);
        this.mediaSource.endOfStream();
      } catch {
        // The source can close while its buffer is being detached.
      }
    }

    if (this.mediaSource) this.onMediaSourceDetached(this.mediaSource);
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.metadata = null;
    this.streamUrl = null;
    this.cryptoKey = null;
    this.ivBytes = null;
    this.appendedSegments.clear();
    this.requiredTailStartIndex = 0;
    this.needsUrgentFill = false;
    this.appendQueue = [];
    this.flushing = false;
  }

  protected createMediaSource(): MediaSource {
    return new MediaSource();
  }

  protected onMediaSourceCreated(mediaSource: MediaSource): void {
    void mediaSource;
  }

  protected onMediaSourceDetached(mediaSource: MediaSource): void {
    void mediaSource;
  }

  protected prepareAudio(audio: HTMLAudioElement): void {
    void audio;
  }

  protected restoreAudio(audio: HTMLAudioElement): void {
    void audio;
  }

  protected canFetchSegments(): boolean {
    return true;
  }

  protected resumeFetching(): void {
    if (this.disposed) return;
    if (!this.abortController || this.abortController.signal.aborted) {
      this.abortController = new AbortController();
    }
    this.fillBuffer();
  }

  protected suspendFetching(): void {
    this.cancelFetching();
  }

  private async loadInitialData(
    songId: string,
    preloaded?: PreloadedSong,
  ): Promise<Pick<PreloadedSong, "initSegment" | "firstSegmentsBatch" | "preloadedCount">> {
    if (preloaded) {
      this.streamUrl = preloaded.streamInfo.streamUrl;
      this.cryptoKey = preloaded.cryptoKey;
      this.ivBytes = preloaded.ivBytes;
      this.metadata = preloaded.metadata;

      return preloaded;
    }

    const signal = this.abortController?.signal;
    if (!signal) throw new DOMException("Player detached", "AbortError");

    const [streamInfo, metadata] = await Promise.all([
      getStreamInfo(songId),
      getStreamMetadata(songId),
    ]);
    if (this.disposed || signal.aborted) {
      throw new DOMException("Player detached", "AbortError");
    }

    this.streamUrl = streamInfo.streamUrl;
    this.cryptoKey = await importAesKey(streamInfo.key);
    this.ivBytes = hexToBytes(streamInfo.iv);
    this.metadata = metadata;

    const preloadedCount = Math.min(INITIAL_BATCH, metadata.segments.length);
    const lastSegment = metadata.segments[preloadedCount - 1];
    const fetchEnd = lastSegment
      ? lastSegment.startByte + lastSegment.size - 1
      : metadata.initRange.end;
    const cipher = await fetchRange(this.streamUrl, 0, fetchEnd, signal);
    if (this.disposed || signal.aborted) {
      throw new DOMException("Player detached", "AbortError");
    }

    const plain = await decryptChunk(this.cryptoKey, this.ivBytes, cipher, 0);
    if (this.disposed || signal.aborted) {
      throw new DOMException("Player detached", "AbortError");
    }

    return {
      initSegment: plain.slice(0, metadata.initRange.end + 1),
      firstSegmentsBatch:
        preloadedCount > 0
          ? plain.slice(metadata.initRange.end + 1)
          : new ArrayBuffer(0),
      preloadedCount,
    };
  }

  private onSeeking = (): void => {
    if (!this.audio || !this.metadata) return;

    const targetTime = this.audio.currentTime;
    const targetIndex = findSegmentIndex(this.metadata.segments, targetTime);
    if (this.isTimeBuffered(targetTime)) {
      this.requiredTailStartIndex = Math.min(this.requiredTailStartIndex, targetIndex);
      if (!this.downloading && this.getBufferAhead() < BUFFER_LOW_SEC) {
        this.fillBuffer();
      }
      return;
    }

    this.requiredTailStartIndex = targetIndex;
    this.cancelFetching();
    this.abortController = new AbortController();
    this.needsUrgentFill = true;
    this.fillBuffer();
  };

  private onTimeUpdate = (): void => {
    if (this.disposed) return;

    this.tryEndOfStream();
    if (!this.downloading && this.getBufferAhead() < BUFFER_LOW_SEC) {
      this.fillBuffer();
    }
  };

  private cancelFetching(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.fillGeneration += 1;
    this.downloading = false;
  }

  private getBufferAhead(): number {
    if (!this.audio) return 0;

    const currentTime = this.audio.currentTime;
    const buffered = this.audio.buffered;
    for (let index = 0; index < buffered.length; index += 1) {
      if (
        currentTime >= buffered.start(index) - 0.1 &&
        currentTime <= buffered.end(index)
      ) {
        return buffered.end(index) - currentTime;
      }
    }

    return 0;
  }

  private async fetchAndAppendBatch(
    startIndex: number,
    count: number,
    signal: AbortSignal,
  ): Promise<void> {
    const segments = this.metadata?.segments;
    if (!segments || !this.streamUrl || !this.cryptoKey || !this.ivBytes) return;

    const endIndex = Math.min(startIndex + count, segments.length);
    let from = startIndex;
    while (from < endIndex && this.appendedSegments.has(from)) from += 1;
    if (from >= endIndex) return;

    let to = from + 1;
    while (to < endIndex && !this.appendedSegments.has(to)) to += 1;

    const firstSegment = segments[from];
    const lastSegment = segments[to - 1];
    const cipher = await fetchRange(
      this.streamUrl,
      firstSegment.startByte,
      lastSegment.startByte + lastSegment.size - 1,
      signal,
    );
    if (this.disposed || signal.aborted) return;

    const plain = await decryptChunk(
      this.cryptoKey,
      this.ivBytes,
      cipher,
      firstSegment.startByte,
    );
    if (this.disposed || signal.aborted) return;

    await this.appendBuffer(plain);
    for (let index = from; index < to; index += 1) {
      this.appendedSegments.add(index);
    }
  }

  private async fillBuffer(): Promise<void> {
    if (
      this.downloading ||
      this.disposed ||
      !this.canFetchSegments() ||
      !this.audio ||
      !this.metadata ||
      !this.abortController
    ) {
      return;
    }

    this.downloading = true;
    const generation = this.fillGeneration;
    const signal = this.abortController.signal;
    const segments = this.metadata.segments;

    try {
      while (!this.disposed && generation === this.fillGeneration) {
        const targetIndex = Math.min(
          findSegmentIndex(segments, this.audio.currentTime + BUFFER_GOAL_SEC),
          segments.length - 1,
        );
        const currentIndex = findSegmentIndex(segments, this.audio.currentTime);
        let cursor = currentIndex;
        while (cursor <= targetIndex && this.appendedSegments.has(cursor)) {
          cursor += 1;
        }
        if (cursor > targetIndex) break;

        const batchSize = this.needsUrgentFill
          ? SEEK_BATCH
          : getBatchSegmentCount(segments, cursor, BUFFER_BATCH_BYTES);
        this.needsUrgentFill = false;
        await this.fetchAndAppendBatch(
          cursor,
          batchSize,
          signal,
        );
      }
    } catch {
      // Abort and transport failures are retried by the next playback event.
    } finally {
      if (generation === this.fillGeneration) {
        this.downloading = false;
        this.tryEndOfStream();
      }
    }
  }

  private tryEndOfStream(): void {
    if (this.disposed || !this.metadata || this.mediaSource?.readyState !== "open") {
      return;
    }

    for (
      let index = this.requiredTailStartIndex;
      index < this.metadata.segments.length;
      index += 1
    ) {
      if (!this.appendedSegments.has(index)) return;
    }

    try {
      this.mediaSource.endOfStream();
    } catch {
      // The MediaSource may close between the state check and this call.
    }
  }

  private isTimeBuffered(time: number): boolean {
    if (!this.audio) return false;

    const buffered = this.audio.buffered;
    for (let index = 0; index < buffered.length; index += 1) {
      if (time >= buffered.start(index) && time <= buffered.end(index)) return true;
    }

    return false;
  }

  private async appendBuffer(data: ArrayBuffer): Promise<void> {
    if (!this.sourceBuffer || this.disposed) return;

    this.appendQueue.push(data);
    if (this.flushing) return;

    this.flushing = true;
    try {
      while (this.appendQueue.length > 0 && !this.disposed) {
        const buffer = this.appendQueue.shift();
        if (!buffer || !this.sourceBuffer) return;

        this.sourceBuffer.appendBuffer(buffer);
        await waitForUpdateEnd(this.sourceBuffer);
      }
    } finally {
      this.flushing = false;
    }
  }
}

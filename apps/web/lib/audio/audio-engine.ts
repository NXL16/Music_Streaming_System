import type { StreamDataResponse } from "@/lib/api";
import {
  BACKGROUND_PRELOAD_DELAY_MS,
  BACKGROUND_PRELOAD_SEGMENTS_PER_REQUEST,
  BUFFER_AHEAD_SECONDS,
  MAX_CACHE_SIZE,
  MAX_INFLIGHT_FETCHES,
  MAX_PENDING_CHUNKS,
  MIME_TYPE,
  SEGMENTS_PER_REQUEST,
  STARTUP_SEGMENTS_PER_REQUEST,
  SEEK_PREFETCH_SEGMENTS,
  SEEK_SNAP_TOLERANCE,
  UNSTALL_OFFSET_SECONDS,
} from "./audio-constants";
import type { AudioEngineOptions, PlaybackState } from "./audio-engine-types";
import { LRUCache } from "./lru-cache";
import {
  appendNextChunk,
  cleanSourceBufferOldData,
  createMediaSourceUrl,
  isMediaSourceSupported,
} from "./media-source-controller";
import { recoverFromPlaybackStall } from "./playback-recovery";
import { fetchRange } from "./segment-fetcher";
import { getSegmentIndexForTime, getSegmentRange } from "./segment-utils";

export class AudioEngine {
  private audio: HTMLAudioElement | null = null;
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private objectUrl: string | null = null;
  private fetchAbort: AbortController | null = null;
  private preloadAbort: AbortController | null = null;

  private pendingChunks: ArrayBuffer[] = [];
  private meta: StreamDataResponse | null = null;
  private streamUrl: string | null = null;
  private songId: string | null = null;

  private nextSegmentIndex = 0;
  private inFlightCount = 0;
  private sessionId = 0;
  private preloadRunId = 0;

  private pendingSeekTime: number | null = null;
  private seekInProgress = false;
  private initializedPlayback = false;
  private stalled = false;
  private playbackState: PlaybackState = "idle";

  private updateEndListener: (() => void) | null = null;
  private progressRafId = 0;
  private fetchTimerId: number | null = null;
  private seekTimerId: number | null = null;

  private initCache = new LRUCache<string, ArrayBuffer>(10);
  private segmentCache = new LRUCache<string, ArrayBuffer>(MAX_CACHE_SIZE);

  constructor(private readonly options: AudioEngineOptions) {
    this.audio = new Audio();
    this.bindAudioEvents();
  }

  setMetadata(songId: string, meta: StreamDataResponse): void {
    this.songId = songId;
    this.meta = meta;
    this.segmentCache.clear();
    this.restartBackgroundPreload();

    if (meta.duration > 0) {
      this.options.onDuration?.(meta.duration);
    }

    if (this.streamUrl) {
      void this.resetPipeline(0);
      this.startBackgroundPreload();
    }
  }

  setStreamUrl(streamUrl: string | null): void {
    this.streamUrl = streamUrl;

    if (!streamUrl || !this.meta || !this.songId) return;

    void this.resetPipeline(0);
    this.startBackgroundPreload();
  }

  setPlaying(isPlaying: boolean): void {
    const audio = this.audio;

    if (!audio) return;

    if (isPlaying) {
      if (this.playbackState !== "seeking") {
        this.safePlay();
        this.playbackState = "playing";
      }

      this.startFetchLoop();
      this.startProgressLoop();

      return;
    }

    audio.pause();
    this.playbackState = "paused";
    this.stopFetchLoop();
    this.stopProgressLoop();
  }

  setVolume(volume: number): void {
    if (this.audio) {
      this.audio.volume = volume;
    }
  }

  seek(percent: number): void {
    const audio = this.audio;
    const meta = this.meta;

    if (!audio || !meta || meta.duration <= 0) return;

    const safePercent = Math.max(0, Math.min(100, percent));
    const targetTime = (safePercent / 100) * meta.duration;

    this.options.onProgress(safePercent);

    this.seekInProgress = true;
    this.playbackState = "seeking";

    const sourceBuffer = this.sourceBuffer;

    if (sourceBuffer && !sourceBuffer.updating) {
      const buffered = this.getBufferedRanges(sourceBuffer);

      for (let i = 0; buffered && i < buffered.length; i += 1) {
        const start = buffered.start(i);
        const end = buffered.end(i);

        if (targetTime >= start && targetTime <= end) {
          audio.currentTime = targetTime;
          this.seekInProgress = false;
          this.playbackState = "playing";
          return;
        }
      }
    }

    this.pendingSeekTime = targetTime;

    if (this.seekTimerId !== null) {
      window.clearTimeout(this.seekTimerId);
      this.seekTimerId = null;
    }

    this.seekTimerId = window.setTimeout(() => {
      const latestMeta = this.meta;
      const latestPendingSeek = this.pendingSeekTime;

      this.seekTimerId = null;

      if (!latestMeta || latestPendingSeek === null) return;

      const targetSegmentIndex = getSegmentIndexForTime(
        latestMeta,
        latestPendingSeek,
      );

      void this.resetPipeline(targetSegmentIndex);
    }, 120);
  }

  reset(): void {
    this.fetchAbort?.abort();
    this.preloadAbort?.abort();
    this.clearPendingSeekTimer();

    this.pendingChunks = [];
    this.meta = null;
    this.streamUrl = null;
    this.songId = null;
    this.nextSegmentIndex = 0;
    this.inFlightCount = 0;
    this.pendingSeekTime = null;
    this.seekInProgress = false;
    this.initializedPlayback = false;
    this.stalled = false;
    this.playbackState = "idle";
    this.preloadRunId += 1;

    this.segmentCache.clear();

    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
    }

    this.cleanupMediaSource();
  }

  destroy(): void {
    this.stopFetchLoop();
    this.stopProgressLoop();
    this.clearPendingSeekTimer();

    this.fetchAbort?.abort();
    this.preloadAbort?.abort();

    if (this.audio) {
      this.unbindAudioEvents();
      this.audio.pause();
      this.audio.src = "";
      this.audio = null;
    }

    this.cleanupMediaSource();

    this.pendingChunks = [];
    this.initCache.clear();
    this.segmentCache.clear();

    this.playbackState = "idle";
    this.preloadRunId += 1;
  }

  private async resetPipeline(startSegmentIndex: number): Promise<void> {
    const meta = this.meta;
    const stream = this.streamUrl;
    const songId = this.songId;

    if (!meta || !stream || !songId) return;

    this.sessionId += 1;

    const currentSessionId = this.sessionId;

    this.inFlightCount = 0;
    this.pendingChunks = [];
    this.nextSegmentIndex = Math.max(0, startSegmentIndex);
    this.initializedPlayback = false;
    this.stalled = false;

    this.playbackState = this.seekInProgress ? "seeking" : "loading";

    this.fetchAbort?.abort();
    this.fetchAbort = new AbortController();
    const fetchSignal = this.fetchAbort.signal;

    if (!this.audio) {
      this.audio = new Audio();
      this.bindAudioEvents();
    }

    this.audio.pause();

    this.cleanupMediaSource();

    const startupDataPromise = this.prepareStartupData({
      meta,
      stream,
      songId,
      startSegmentIndex: this.nextSegmentIndex,
      signal: fetchSignal,
      sessionId: currentSessionId,
    });

    const { mediaSource, objectUrl } = createMediaSourceUrl();

    this.mediaSource = mediaSource;
    this.objectUrl = objectUrl;
    this.sourceBuffer = null;

    this.audio.src = objectUrl;

    mediaSource.addEventListener(
      "sourceopen",
      async () => {
        if (currentSessionId !== this.sessionId) return;
        if (!isMediaSourceSupported()) return;

        const sourceBuffer = mediaSource.addSourceBuffer(MIME_TYPE);

        this.sourceBuffer = sourceBuffer;

        const handleUpdateEnd = () => {
          if (currentSessionId !== this.sessionId) return;

          this.handleSourceBufferUpdateEnd(sourceBuffer);
        };

        this.updateEndListener = handleUpdateEnd;
        sourceBuffer.addEventListener("updateend", handleUpdateEnd);

        const initStart = Math.max(0, meta.initRange.start ?? 0);
        const initEnd = Math.max(
          initStart,
          meta.initRange.end ?? Math.max(0, meta.encryptionStartOffset - 1),
        );

        const initKey = `${songId}:init:${initStart}-${initEnd}`;
        const startupData = await startupDataPromise;
        const initData = startupData.initData ?? this.initCache.get(initKey);

        if (!initData || currentSessionId !== this.sessionId) return;

        this.pendingChunks.push(initData);
        this.pendingChunks.push(...startupData.startupChunks);
        this.nextSegmentIndex = Math.max(
          this.nextSegmentIndex,
          startupData.nextSegmentIndex,
        );

        this.appendNext();

        if (startupData.startupChunks.length === 0) {
          void this.fetchNextSegment();
        }

        void this.prefetchAheadFrom(this.nextSegmentIndex, SEEK_PREFETCH_SEGMENTS);
      },
      { once: true },
    );
  }

  private handleSourceBufferUpdateEnd(sourceBuffer: SourceBuffer): void {
    const audio = this.audio;

    if (!audio) return;

    const pendingSeek = this.pendingSeekTime;

    if (pendingSeek !== null) {
      let matched = false;
      const buffered = this.getBufferedRanges(sourceBuffer);

      for (let i = 0; buffered && i < buffered.length; i += 1) {
        const start = buffered.start(i);
        const end = buffered.end(i);

        if (
          pendingSeek >= start - SEEK_SNAP_TOLERANCE &&
          pendingSeek <= end + SEEK_SNAP_TOLERANCE
        ) {
          matched = true;
          break;
        }
      }

      if (matched) {
        try {
          const bufferedStart =
            buffered && buffered.length > 0
              ? buffered.start(0)
              : 0;

          audio.currentTime = Math.max(bufferedStart, pendingSeek);

          this.pendingSeekTime = null;
          this.seekInProgress = false;
          this.playbackState = "buffering";
        } catch {}
      } else if (buffered && buffered.length > 0) {
        try {
          const start = buffered.start(0);

          audio.currentTime = start + UNSTALL_OFFSET_SECONDS;

          this.pendingSeekTime = null;
          this.seekInProgress = false;
          this.playbackState = "buffering";
        } catch {}
      }

      if (this.pendingSeekTime !== null) {
        this.appendNext();
        this.maybeFetchMore();
        return;
      }
    }

    if (
      !this.seekInProgress &&
      !this.initializedPlayback &&
      this.playbackState !== "paused"
    ) {
      this.initializedPlayback = true;
      this.playbackState = "playing";
      this.safePlay();
    }

    cleanSourceBufferOldData({
      sourceBuffer,
      audio,
    });

    this.appendNext();
    this.maybeFetchMore();
  }

  private async fetchNextSegment(): Promise<void> {
    const meta = this.meta;
    const stream = this.streamUrl;
    const songId = this.songId;
    const currentSessionId = this.sessionId;

    if (!meta || !stream || !songId) return;
    if (this.stalled) return;
    if (this.inFlightCount >= MAX_INFLIGHT_FETCHES) return;
    if (this.pendingChunks.length > MAX_PENDING_CHUNKS) return;
    if (this.nextSegmentIndex >= meta.segments.length) return;

    this.inFlightCount += 1;

    if (this.playbackState !== "seeking") {
      this.playbackState = "buffering";
    }

    try {
      let startIdx = this.nextSegmentIndex;

      while (
        startIdx < meta.segments.length &&
        this.pendingChunks.length <= MAX_PENDING_CHUNKS
      ) {
        const uncachedStart = startIdx;
        let uncachedEnd = uncachedStart - 1;
        let onlyCached = true;

        for (
          let i = uncachedStart;
          i <
          Math.min(meta.segments.length, uncachedStart + SEGMENTS_PER_REQUEST);
          i += 1
        ) {
          const { start, end } = getSegmentRange(meta, i);
          const cacheKey = `${songId}:seg:${i}:${start}-${end}`;
          const cached = this.segmentCache.get(cacheKey);

          if (cached) {
            this.pendingChunks.push(cached);
            this.nextSegmentIndex = i + 1;

            if (this.pendingChunks.length > MAX_PENDING_CHUNKS) break;

            continue;
          }

          onlyCached = false;
          uncachedEnd = i;
        }

        if (this.pendingChunks.length > MAX_PENDING_CHUNKS) break;

        if (onlyCached) {
          startIdx = this.nextSegmentIndex;
          continue;
        }

        const batchStart = uncachedStart;
        const batchFinal = Math.max(batchStart, uncachedEnd);

        const rangeStart = meta.segments[batchStart].startByte;
        const lastSegment = meta.segments[batchFinal];
        const rangeEnd =
          lastSegment.startByte + Math.max(1, lastSegment.size) - 1;

        const batchKey = `${songId}:batch:${batchStart}-${batchFinal}:${rangeStart}-${rangeEnd}`;

        const batchData = await fetchRange({
          url: stream,
          start: rangeStart,
          end: rangeEnd,
          signal: this.fetchAbort?.signal,
          cacheKey: batchKey,
          cache: this.segmentCache,
          readCache: false,
          writeCache: false,
          sessionId: currentSessionId,
          getCurrentSessionId: () => this.sessionId,
        });

        if (!batchData || currentSessionId !== this.sessionId) return;

        let offset = 0;

        for (let i = batchStart; i <= batchFinal; i += 1) {
          const segmentSize = Math.max(1, meta.segments[i].size);
          const part = batchData.slice(offset, offset + segmentSize);

          offset += segmentSize;

          if (part.byteLength === 0) break;

          const { start, end } = getSegmentRange(meta, i);
          const segmentKey = `${songId}:seg:${i}:${start}-${end}`;

          this.segmentCache.set(segmentKey, part);
          this.pendingChunks.push(part);
          this.nextSegmentIndex = i + 1;

          if (this.pendingChunks.length > MAX_PENDING_CHUNKS) break;
        }

        break;
      }

      this.appendNext();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;

      this.stalled = true;
      this.playbackState = "stalled";
      this.options.onError?.(err);
    } finally {
      if (currentSessionId === this.sessionId) {
        this.inFlightCount = Math.max(0, this.inFlightCount - 1);
      }
    }
  }

  private async prepareStartupData(params: {
    meta: StreamDataResponse;
    stream: string;
    songId: string;
    startSegmentIndex: number;
    signal: AbortSignal;
    sessionId: number;
  }): Promise<{
    initData: ArrayBuffer | null;
    startupChunks: ArrayBuffer[];
    nextSegmentIndex: number;
  }> {
    const { meta, stream, songId, startSegmentIndex, signal, sessionId } = params;

    const initStart = Math.max(0, meta.initRange.start ?? 0);
    const initEnd = Math.max(
      initStart,
      meta.initRange.end ?? Math.max(0, meta.encryptionStartOffset - 1),
    );
    const initKey = `${songId}:init:${initStart}-${initEnd}`;
    const cachedInit = this.initCache.get(initKey) ?? null;

    if (startSegmentIndex >= meta.segments.length) {
      if (!cachedInit) {
        const initData = await fetchRange({
          url: stream,
          start: initStart,
          end: initEnd,
          signal,
          cacheKey: `${songId}:init-buffer`,
          cache: this.segmentCache,
          sessionId,
          getCurrentSessionId: () => this.sessionId,
        });

        if (initData?.byteLength) {
          this.initCache.set(initKey, initData);
        }

        return {
          initData: initData ?? null,
          startupChunks: [],
          nextSegmentIndex: startSegmentIndex,
        };
      }

      return {
        initData: cachedInit,
        startupChunks: [],
        nextSegmentIndex: startSegmentIndex,
      };
    }

    const startupEndIndex = Math.min(
      meta.segments.length - 1,
      startSegmentIndex + STARTUP_SEGMENTS_PER_REQUEST - 1,
    );

    const startupChunks: ArrayBuffer[] = [];
    let firstUncached = -1;
    let lastUncached = -1;
    let nextSegmentIndex = startSegmentIndex;

    for (let i = startSegmentIndex; i <= startupEndIndex; i += 1) {
      const { start, end } = getSegmentRange(meta, i);
      const segmentKey = `${songId}:seg:${i}:${start}-${end}`;
      const cached = this.segmentCache.get(segmentKey);

      if (cached) {
        startupChunks.push(cached);
        nextSegmentIndex = i + 1;
        continue;
      }

      if (firstUncached < 0) firstUncached = i;
      lastUncached = i;
    }

    let initData: ArrayBuffer | null = cachedInit;

    if (firstUncached < 0 || lastUncached < 0) {
      if (!initData) {
        initData = await fetchRange({
          url: stream,
          start: initStart,
          end: initEnd,
          signal,
          cacheKey: `${songId}:init-buffer`,
          cache: this.segmentCache,
          sessionId,
          getCurrentSessionId: () => this.sessionId,
        });

        if (initData?.byteLength) {
          this.initCache.set(initKey, initData);
        }
      }

      return { initData, startupChunks, nextSegmentIndex };
    }

    const rangeStart = meta.segments[firstUncached].startByte;
    const lastSegment = meta.segments[lastUncached];
    const rangeEnd = lastSegment.startByte + Math.max(1, lastSegment.size) - 1;
    const mergeInitWithSegments =
      !initData &&
      firstUncached === startSegmentIndex &&
      initEnd + 1 >= rangeStart;

    const batchStart = mergeInitWithSegments ? initStart : rangeStart;
    const batchKey = `${songId}:startup:${firstUncached}-${lastUncached}:${batchStart}-${rangeEnd}`;

    const batchData = await fetchRange({
      url: stream,
      start: batchStart,
      end: rangeEnd,
      signal,
      cacheKey: batchKey,
      cache: this.segmentCache,
      readCache: false,
      writeCache: false,
      sessionId,
      getCurrentSessionId: () => this.sessionId,
    });

    if (!batchData || sessionId !== this.sessionId) {
      return { initData, startupChunks, nextSegmentIndex };
    }

    let offset = 0;

    if (mergeInitWithSegments) {
      const initLength = Math.max(0, initEnd - initStart + 1);
      const initPart = batchData.slice(0, initLength);

      if (initPart.byteLength > 0) {
        this.initCache.set(initKey, initPart);
        initData = initPart;
      }

      offset = initLength;
    } else if (!initData) {
      initData = await fetchRange({
        url: stream,
        start: initStart,
        end: initEnd,
        signal,
        cacheKey: `${songId}:init-buffer`,
        cache: this.segmentCache,
        sessionId,
        getCurrentSessionId: () => this.sessionId,
      });

      if (initData?.byteLength) {
        this.initCache.set(initKey, initData);
      }
    }

    for (let i = firstUncached; i <= lastUncached; i += 1) {
      const segmentSize = Math.max(1, meta.segments[i].size);
      const part = batchData.slice(offset, offset + segmentSize);
      offset += segmentSize;

      if (part.byteLength === 0) break;

      const { start, end } = getSegmentRange(meta, i);
      const segmentKey = `${songId}:seg:${i}:${start}-${end}`;
      this.segmentCache.set(segmentKey, part);
      startupChunks.push(part);
      nextSegmentIndex = Math.max(nextSegmentIndex, i + 1);
    }

    return { initData, startupChunks, nextSegmentIndex };
  }

  private maybeFetchMore(): void {
    const audio = this.audio;
    const sourceBuffer = this.sourceBuffer;

    if (!audio || !sourceBuffer) return;
    if (this.stalled) return;
    if (this.inFlightCount >= MAX_INFLIGHT_FETCHES) return;

    const buffered = this.getBufferedRanges(sourceBuffer);
    const bufferedEnd = buffered?.length
      ? buffered.end(buffered.length - 1)
      : 0;

    if (bufferedEnd - audio.currentTime < BUFFER_AHEAD_SECONDS) {
      void this.fetchNextSegment();
    }
  }

  private appendNext(): void {
    appendNextChunk({
      sourceBuffer: this.sourceBuffer,
      mediaSource: this.mediaSource,
      pendingChunks: this.pendingChunks,
      isStalled: () => this.stalled,
      markStalled: () => {
        this.stalled = true;
        this.playbackState = "stalled";
        this.pendingChunks = [];
        this.inFlightCount = 0;
      },
    });
  }

  private safePlay(): void {
    const audio = this.audio;

    if (!audio) return;

    audio.play().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);

      if (msg.includes("interrupted by a call to pause")) return;

      this.options.onError?.(err);
    });
  }

  private bindAudioEvents(): void {
    const audio = this.audio;

    if (!audio) return;

    audio.addEventListener("timeupdate", this.handleTimeUpdate);
    audio.addEventListener("ended", this.handleEnded);
    audio.addEventListener("error", this.handleError);
    audio.addEventListener("waiting", this.handlePlaybackStall);
    audio.addEventListener("stalled", this.handlePlaybackStall);
  }

  private unbindAudioEvents(): void {
    const audio = this.audio;

    if (!audio) return;

    audio.removeEventListener("timeupdate", this.handleTimeUpdate);
    audio.removeEventListener("ended", this.handleEnded);
    audio.removeEventListener("error", this.handleError);
    audio.removeEventListener("waiting", this.handlePlaybackStall);
    audio.removeEventListener("stalled", this.handlePlaybackStall);
  }

  private handleTimeUpdate = (): void => {
    this.maybeFetchMore();
  };

  private handleEnded = (): void => {
    this.playbackState = "paused";
    this.stopFetchLoop();
    this.stopProgressLoop();
    this.options.onEnded?.();
  };

  private handleError = (): void => {
    const audio = this.audio;
    const meta = this.meta;

    if (!audio || !meta) return;

    this.stalled = true;
    this.inFlightCount = 0;
    this.playbackState = "stalled";

    const currentTime = Math.max(
      0,
      Math.min(meta.duration || 0, audio.currentTime || 0),
    );

    const targetSegmentIndex = getSegmentIndexForTime(meta, currentTime);

    this.pendingSeekTime = currentTime;

    void this.resetPipeline(targetSegmentIndex);
  };

  private handlePlaybackStall = (): void => {
    const audio = this.audio;
    const sourceBuffer = this.sourceBuffer;
    const meta = this.meta;

    if (!audio || !sourceBuffer || !meta) return;

    recoverFromPlaybackStall({
      audio,
      sourceBuffer,
      meta,
      isSeeking: this.seekInProgress,
      setPendingSeekTime: (time) => {
        this.pendingSeekTime = time;
      },
      resetPipeline: (segmentIndex) => {
        void this.resetPipeline(segmentIndex);
      },
    });
  };

  private startFetchLoop(): void {
    if (this.fetchTimerId !== null) return;

    this.fetchTimerId = window.setInterval(() => {
      this.maybeFetchMore();
    }, 120);
  }

  private stopFetchLoop(): void {
    if (this.fetchTimerId === null) return;

    window.clearInterval(this.fetchTimerId);
    this.fetchTimerId = null;
  }

  private getBufferedRanges(sourceBuffer: SourceBuffer): TimeRanges | null {
    try {
      return sourceBuffer.buffered;
    } catch {
      return null;
    }
  }

  private async prefetchAheadFrom(
    startIndex: number,
    segmentCount: number,
  ): Promise<void> {
    const meta = this.meta;
    const stream = this.streamUrl;
    const songId = this.songId;
    const currentSessionId = this.sessionId;

    if (!meta || !stream || !songId) return;
    if (segmentCount <= 0) return;
    if (startIndex >= meta.segments.length) return;

    const endIndex = Math.min(
      meta.segments.length - 1,
      startIndex + segmentCount - 1,
    );

    let cursor = startIndex;

    while (cursor <= endIndex) {
      if (currentSessionId !== this.sessionId) return;

      const batchStart = cursor;
      const batchEnd = Math.min(endIndex, batchStart + SEGMENTS_PER_REQUEST - 1);

      let firstUncached = -1;
      let lastUncached = -1;

      for (let i = batchStart; i <= batchEnd; i += 1) {
        const { start, end } = getSegmentRange(meta, i);
        const segmentKey = `${songId}:seg:${i}:${start}-${end}`;
        if (!this.segmentCache.get(segmentKey)) {
          if (firstUncached < 0) firstUncached = i;
          lastUncached = i;
        }
      }

      if (firstUncached < 0 || lastUncached < 0) {
        cursor = batchEnd + 1;
        continue;
      }

      const rangeStart = meta.segments[firstUncached].startByte;
      const lastSegment = meta.segments[lastUncached];
      const rangeEnd = lastSegment.startByte + Math.max(1, lastSegment.size) - 1;

      const batchKey = `${songId}:prefetch:${firstUncached}-${lastUncached}:${rangeStart}-${rangeEnd}`;
      const batchData = await fetchRange({
        url: stream,
        start: rangeStart,
        end: rangeEnd,
        signal: this.fetchAbort?.signal,
        cacheKey: batchKey,
        cache: this.segmentCache,
        readCache: false,
        writeCache: false,
        sessionId: currentSessionId,
        getCurrentSessionId: () => this.sessionId,
      });

      if (!batchData || currentSessionId !== this.sessionId) return;

      let offset = 0;
      for (let i = firstUncached; i <= lastUncached; i += 1) {
        const segmentSize = Math.max(1, meta.segments[i].size);
        const part = batchData.slice(offset, offset + segmentSize);
        offset += segmentSize;
        if (part.byteLength === 0) break;

        const { start, end } = getSegmentRange(meta, i);
        const segmentKey = `${songId}:seg:${i}:${start}-${end}`;
        this.segmentCache.set(segmentKey, part);
      }

      cursor = batchEnd + 1;
    }
  }

  private restartBackgroundPreload(): void {
    this.preloadAbort?.abort();
    this.preloadAbort = null;
    this.preloadRunId += 1;
  }

  private startBackgroundPreload(): void {
    const meta = this.meta;
    const stream = this.streamUrl;
    const songId = this.songId;

    if (!meta || !stream || !songId) return;

    this.preloadAbort?.abort();
    this.preloadAbort = new AbortController();
    this.preloadRunId += 1;

    const runId = this.preloadRunId;
    const signal = this.preloadAbort.signal;

    window.setTimeout(() => {
      void this.preloadSegmentsToRam({
        meta,
        stream,
        songId,
        runId,
        signal,
      });
    }, BACKGROUND_PRELOAD_DELAY_MS);
  }

  private async preloadSegmentsToRam(params: {
    meta: StreamDataResponse;
    stream: string;
    songId: string;
    runId: number;
    signal: AbortSignal;
  }): Promise<void> {
    const { meta, stream, songId, runId, signal } = params;

    let cursor = 0;

    while (cursor < meta.segments.length) {
      if (signal.aborted || runId !== this.preloadRunId) return;

      let firstUncached = -1;
      let lastUncached = -1;
      const batchEnd = Math.min(
        meta.segments.length - 1,
        cursor + BACKGROUND_PRELOAD_SEGMENTS_PER_REQUEST - 1,
      );

      for (let i = cursor; i <= batchEnd; i += 1) {
        const { start, end } = getSegmentRange(meta, i);
        const segmentKey = `${songId}:seg:${i}:${start}-${end}`;

        if (!this.segmentCache.get(segmentKey)) {
          if (firstUncached < 0) firstUncached = i;
          lastUncached = i;
        }
      }

      if (firstUncached < 0 || lastUncached < 0) {
        cursor = batchEnd + 1;
        continue;
      }

      const rangeStart = meta.segments[firstUncached].startByte;
      const lastSegment = meta.segments[lastUncached];
      const rangeEnd = lastSegment.startByte + Math.max(1, lastSegment.size) - 1;

      const batchData = await fetchRange({
        url: stream,
        start: rangeStart,
        end: rangeEnd,
        signal,
        cacheKey: `${songId}:ram-preload:${firstUncached}-${lastUncached}:${rangeStart}-${rangeEnd}`,
        cache: this.segmentCache,
        readCache: false,
        writeCache: false,
        sessionId: runId,
        getCurrentSessionId: () => this.preloadRunId,
      });

      if (!batchData || signal.aborted || runId !== this.preloadRunId) return;

      let offset = 0;
      for (let i = firstUncached; i <= lastUncached; i += 1) {
        const segmentSize = Math.max(1, meta.segments[i].size);
        const part = batchData.slice(offset, offset + segmentSize);
        offset += segmentSize;

        if (part.byteLength === 0) break;

        const { start, end } = getSegmentRange(meta, i);
        const segmentKey = `${songId}:seg:${i}:${start}-${end}`;
        this.segmentCache.set(segmentKey, part);
      }

      cursor = batchEnd + 1;
      await new Promise((resolve) => {
        window.setTimeout(resolve, 0);
      });
    }
  }

  private clearPendingSeekTimer(): void {
    if (this.seekTimerId === null) return;
    window.clearTimeout(this.seekTimerId);
    this.seekTimerId = null;
  }

  private startProgressLoop(): void {
    if (this.progressRafId) return;

    const tick = () => {
      const audio = this.audio;
      const meta = this.meta;

      if (!this.seekInProgress && audio && meta && meta.duration > 0) {
        const progress = (audio.currentTime / meta.duration) * 100;

        if (Number.isFinite(progress)) {
          this.options.onProgress(Math.max(0, Math.min(100, progress)));
        }
      }

      this.progressRafId = window.requestAnimationFrame(tick);
    };

    this.progressRafId = window.requestAnimationFrame(tick);
  }

  private stopProgressLoop(): void {
    if (!this.progressRafId) return;

    window.cancelAnimationFrame(this.progressRafId);
    this.progressRafId = 0;
  }

  private cleanupMediaSource(): void {
    if (this.sourceBuffer && this.updateEndListener) {
      try {
        this.sourceBuffer.removeEventListener(
          "updateend",
          this.updateEndListener,
        );
      } catch {}
    }

    if (this.mediaSource) {
      try {
        if (this.mediaSource.readyState === "open") {
          this.mediaSource.endOfStream();
        }
      } catch {}
    }

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }

    this.mediaSource = null;
    this.sourceBuffer = null;
    this.objectUrl = null;
    this.updateEndListener = null;
  }
}

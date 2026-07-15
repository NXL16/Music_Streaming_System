import { getStreamInfo, getStreamMetadata } from "../stream.api";
import { decryptChunk, hexToBytes, importAesKey } from "./crypto";
import { fetchRange } from "./fetcher";
import type { PreloadedSong } from "./types";

const MAX_CACHE_SIZE = 2;
const PRELOAD_SEGMENTS_COUNT = 3;

class PreloadCacheStore {
  private cache = new Map<string, PreloadedSong>();
  private pending = new Map<string, AbortController>();

  async preload(songId: string): Promise<void> {
    if (this.cache.has(songId) || this.pending.has(songId)) return;

    const controller = new AbortController();
    this.pending.set(songId, controller);

    try {
      const signal = controller.signal;
      const [streamInfo, metadata] = await Promise.all([
        getStreamInfo(songId),
        getStreamMetadata(songId),
      ]);

      if (signal.aborted) return;

      const cryptoKey = await importAesKey(streamInfo.key);
      const ivBytes = hexToBytes(streamInfo.iv);

      const segments = metadata.segments;
      const initEnd = metadata.initRange.end;
      const count = Math.min(PRELOAD_SEGMENTS_COUNT, segments.length);

      let fetchEnd: number;
      if (count > 0) {
        const lastSeg = segments[count - 1];
        fetchEnd = lastSeg.startByte + lastSeg.size - 1;
      } else {
        fetchEnd = initEnd;
      }

      const cipher = await fetchRange(streamInfo.streamUrl, 0, fetchEnd, signal);
      if (signal.aborted) return;

      const plain = await decryptChunk(cryptoKey, ivBytes, cipher, 0);
      if (signal.aborted) return;

      const initSegment = plain.slice(0, initEnd + 1);
      const firstSegmentsBatch =
        count > 0 ? plain.slice(initEnd + 1) : new ArrayBuffer(0);

      if (this.cache.size >= MAX_CACHE_SIZE) {
        const oldest = this.cache.keys().next().value;
        if (oldest) this.cache.delete(oldest);
      }

      this.cache.set(songId, {
        songId,
        streamInfo,
        metadata,
        cryptoKey,
        ivBytes,
        initSegment,
        firstSegmentsBatch,
        preloadedCount: count,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      throw err;
    } finally {
      this.pending.delete(songId);
    }
  }

  cancelPreload(songId: string): void {
    const controller = this.pending.get(songId);
    if (controller) {
      controller.abort();
      this.pending.delete(songId);
    }
  }

  get(songId: string): PreloadedSong | undefined {
    return this.cache.get(songId);
  }

  evict(songId: string): void {
    this.cache.delete(songId);
    this.cancelPreload(songId);
  }

  clear(): void {
    for (const controller of this.pending.values()) {
      controller.abort();
    }
    this.pending.clear();
    this.cache.clear();
  }
}

export const preloadCache = new PreloadCacheStore();

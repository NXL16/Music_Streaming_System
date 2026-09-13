import {
  getHighPlaybackManifestWithTimeout,
  getPlaybackManifest,
} from "../stream.api";
import { decryptChunk, hexToBytes, importAesKey } from "./crypto";
import { fetchRange } from "./fetcher";
import {
  selectInitialRendition,
  shouldPreferHighQuality,
} from "./quality-policy";
import type { PreloadedPlayback, PreloadedSong, StemPlayback } from "./types";

const MAX_CACHE_SIZE = 3;
const MAX_PENDING_PRELOADS = 2;
const BOOTSTRAP_SEGMENTS_COUNT = 1;
const INTENT_DELAY_MS = 140;

type PreloadKind = "intent" | "queue";

type PendingPreload = {
  controller: AbortController;
  kind: PreloadKind;
  promise: Promise<void>;
  token: symbol;
};

async function preloadStem(
  songId: string,
  stem: StemPlayback,
  signal: AbortSignal,
): Promise<PreloadedSong> {
  const cryptoKey = await importAesKey(stem.key);
  const ivBytes = hexToBytes(stem.iv);
  const { metadata } = stem;
  const count = Math.min(BOOTSTRAP_SEGMENTS_COUNT, metadata.segments.length);
  const lastSegment = metadata.segments[count - 1];
  const fetchEnd = lastSegment
    ? lastSegment.startByte + lastSegment.size - 1
    : metadata.initRange.end;
  const cipher = await fetchRange(stem.streamUrl, 0, fetchEnd, signal);
  if (signal.aborted) throw new DOMException("Preload aborted", "AbortError");

  const plain = await decryptChunk(cryptoKey, ivBytes, cipher, 0);
  if (signal.aborted) throw new DOMException("Preload aborted", "AbortError");

  return {
    songId,
    streamInfo: stem,
    metadata,
    cryptoKey,
    ivBytes,
    initSegment: plain.slice(0, metadata.initRange.end + 1),
    firstSegmentsBatch:
      count > 0 ? plain.slice(metadata.initRange.end + 1) : new ArrayBuffer(0),
    preloadedCount: count,
  };
}

class PreloadCacheStore {
  private cache = new Map<string, PreloadedPlayback>();
  private pending = new Map<string, PendingPreload>();
  private scheduled = new Map<string, ReturnType<typeof setTimeout>>();

  scheduleIntent(songId: string): void {
    if (
      this.cache.has(songId) ||
      this.pending.has(songId) ||
      this.scheduled.has(songId)
    ) {
      return;
    }

    const timer = setTimeout(() => {
      this.scheduled.delete(songId);
      void this.preload(songId, "intent").catch(() => {});
    }, INTENT_DELAY_MS);
    this.scheduled.set(songId, timer);
  }

  warmImmediately(songId: string): void {
    this.cancelScheduled(songId);
    void this.preload(songId, "intent").catch(() => {});
  }

  cancelIntent(songId: string): void {
    this.cancelScheduled(songId);
    const pending = this.pending.get(songId);
    if (pending?.kind === "intent") pending.controller.abort();
  }

  async preload(songId: string, kind: PreloadKind = "queue"): Promise<void> {
    if (this.cache.has(songId)) return;
    const existing = this.pending.get(songId);
    if (existing) return existing.promise;

    while (this.pending.size >= MAX_PENDING_PRELOADS) {
      const oldestEntry = this.pending.entries().next().value as
        | [string, PendingPreload]
        | undefined;
      if (!oldestEntry) break;
      const [oldestSongId, oldest] = oldestEntry;
      oldest.controller.abort();
      this.pending.delete(oldestSongId);
    }

    const controller = new AbortController();
    const token = Symbol(songId);
    const promise = this.load(songId, controller.signal)
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        throw error;
      })
      .finally(() => {
        if (this.pending.get(songId)?.token === token) {
          this.pending.delete(songId);
        }
      });
    this.pending.set(songId, { controller, kind, promise, token });
    return promise;
  }

  private async load(songId: string, signal: AbortSignal): Promise<void> {
    // Queue preload must use the same rendition selection as foreground
    // playback. Otherwise a cached 128 bootstrap wins even when 320 is ready.
    const highPromise = shouldPreferHighQuality()
      ? getHighPlaybackManifestWithTimeout(songId, signal).catch(() => null)
      : Promise.resolve(null);
    const manifest = selectInitialRendition(
      await getPlaybackManifest(songId, signal),
      await highPromise,
    );
    if (signal.aborted) throw new DOMException("Preload aborted", "AbortError");

    let playback: PreloadedPlayback;
    if (manifest.mode === "STANDARD") {
      playback = {
        mode: "STANDARD",
        main: await preloadStem(songId, manifest.main, signal),
      };
    } else {
      const [instrumental, vocal] = await Promise.all([
        preloadStem(songId, manifest.instrumental, signal),
        preloadStem(songId, manifest.vocal, signal),
      ]);
      playback = {
        mode: "SING",
        instrumental,
        vocal,
      };
    }

    if (signal.aborted) throw new DOMException("Preload aborted", "AbortError");
    this.remember(songId, playback);
  }

  private remember(songId: string, playback: PreloadedPlayback): void {
    if (this.cache.size >= MAX_CACHE_SIZE) {
      const oldestSongId = this.cache.keys().next().value as string | undefined;
      if (oldestSongId) this.cache.delete(oldestSongId);
    }
    this.cache.set(songId, playback);
  }

  get(songId: string): PreloadedPlayback | undefined {
    return this.cache.get(songId);
  }

  async waitForPending(songId: string): Promise<PreloadedPlayback | undefined> {
    const pending = this.pending.get(songId);
    if (!pending) return this.get(songId);
    try {
      await pending.promise;
    } catch {
      // A foreground attach falls back to the normal manifest path.
    }
    return this.get(songId);
  }

  consume(songId: string): PreloadedPlayback | undefined {
    const playback = this.cache.get(songId);
    this.cache.delete(songId);
    this.cancelScheduled(songId);
    return playback;
  }

  cancelPreload(songId: string): void {
    this.cancelScheduled(songId);
    this.pending.get(songId)?.controller.abort();
  }

  clear(): void {
    for (const timer of this.scheduled.values()) clearTimeout(timer);
    for (const pending of this.pending.values()) pending.controller.abort();
    this.scheduled.clear();
    this.pending.clear();
    this.cache.clear();
  }

  private cancelScheduled(songId: string): void {
    const timer = this.scheduled.get(songId);
    if (timer) clearTimeout(timer);
    this.scheduled.delete(songId);
  }
}

export const preloadCache = new PreloadCacheStore();

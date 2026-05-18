import { getStreamData, getStreamUrl } from "@/lib/api";
import { fetchRange } from "./segment-fetcher";
import { getSegmentRange } from "./segment-utils";
import {
  getInitBufferKey,
  getInitCacheKey,
  getSegmentCacheKey,
  sharedInitCache,
  sharedSegmentCache,
} from "./shared-audio-cache";

const inFlightPrewarms = new Map<string, Promise<void>>();

export function prewarmSongStart(songId: string): Promise<void> {
  const existing = inFlightPrewarms.get(songId);
  if (existing) return existing;

  const runId = Date.now();

  const promise = (async () => {
    const [streamUrl, meta] = await Promise.all([
      getStreamUrl(songId),
      getStreamData(songId),
    ]);

    const initStart = Math.max(0, meta.initRange.start ?? 0);
    const initEnd = Math.max(
      initStart,
      meta.initRange.end ?? Math.max(0, meta.encryptionStartOffset - 1),
    );
    const firstSegmentIndex = 0;
    const firstSegmentRange =
      meta.segments.length > 0 ? getSegmentRange(meta, firstSegmentIndex) : null;
    const preloadStart = initStart;
    const preloadEnd = firstSegmentRange
      ? Math.max(initEnd, firstSegmentRange.end)
      : initEnd;

    const preloadData = await fetchRange({
      url: streamUrl,
      start: preloadStart,
      end: preloadEnd,
      cacheKey: `${songId}:warmup:${preloadStart}-${preloadEnd}`,
      cache: sharedSegmentCache,
      sessionId: runId,
      getCurrentSessionId: () => runId,
    });

    const initKey = getInitCacheKey(songId, initStart, initEnd);
    if (!sharedInitCache.get(initKey) && preloadData) {
      const initSlice = preloadData.slice(
        Math.max(0, initStart - preloadStart),
        Math.max(0, initEnd - preloadStart + 1),
      );
      if (initSlice.byteLength > 0) {
        sharedInitCache.set(initKey, initSlice);
      }
    } else if (!sharedInitCache.get(initKey)) {
      const initData = await fetchRange({
        url: streamUrl,
        start: initStart,
        end: initEnd,
        cacheKey: getInitBufferKey(songId),
        cache: sharedSegmentCache,
        sessionId: runId,
        getCurrentSessionId: () => runId,
      });

      if (initData?.byteLength) {
        sharedInitCache.set(initKey, initData);
      }
    }

    if (meta.segments.length === 0) return;

    const { start, end } = getSegmentRange(meta, firstSegmentIndex);
    const segmentKey = getSegmentCacheKey(
      songId,
      firstSegmentIndex,
      start,
      end,
    );

    if (!sharedSegmentCache.get(segmentKey) && preloadData) {
      const segSlice = preloadData.slice(
        Math.max(0, start - preloadStart),
        Math.max(0, end - preloadStart + 1),
      );
      if (segSlice.byteLength > 0) {
        sharedSegmentCache.set(segmentKey, segSlice);
        return;
      }
    }

    if (sharedSegmentCache.get(segmentKey)) return;

    await fetchRange({
      url: streamUrl,
      start,
      end,
      cacheKey: segmentKey,
      cache: sharedSegmentCache,
      sessionId: runId,
      getCurrentSessionId: () => runId,
    });
  })().finally(() => {
    inFlightPrewarms.delete(songId);
  });

  inFlightPrewarms.set(songId, promise);
  return promise;
}

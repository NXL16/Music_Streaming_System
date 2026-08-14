import { describe, expect, it, vi } from "vitest";
import {
  clearCachedQueries,
  getCachedQuery,
  invalidateCachedQuery,
  MAX_QUERY_CACHE_ENTRIES,
  setCachedQuery,
} from "./query-cache";

describe("query cache", () => {
  it("deduplicates concurrent reads and reuses a valid entry", async () => {
    const load = vi.fn(async () => "value");

    const [first, second] = await Promise.all([
      getCachedQuery("test:dedupe", load, 60_000),
      getCachedQuery("test:dedupe", load, 60_000),
    ]);
    const third = await getCachedQuery("test:dedupe", load, 60_000);

    expect([first, second, third]).toEqual(["value", "value", "value"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("loads again after invalidation", async () => {
    const load = vi.fn(async () => "fresh");
    await getCachedQuery("test:invalidate", load, 60_000);
    invalidateCachedQuery("test:invalidate");
    await getCachedQuery("test:invalidate", load, 60_000);

    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not let a request from a cleared session replace fresh data", async () => {
    let resolveStale: ((value: string) => void) | undefined;
    const staleLoad = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveStale = resolve;
        }),
    );
    const staleRequest = getCachedQuery("test:session", staleLoad, 60_000);

    clearCachedQueries();

    let resolveFresh: ((value: string) => void) | undefined;
    const freshLoad = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveFresh = resolve;
        }),
    );
    const freshRequest = getCachedQuery("test:session", freshLoad, 60_000);

    resolveStale?.("stale");
    await staleRequest;

    const duplicateFreshRequest = getCachedQuery(
      "test:session",
      freshLoad,
      60_000,
    );
    expect(freshLoad).toHaveBeenCalledTimes(1);

    resolveFresh?.("fresh");
    await expect(freshRequest).resolves.toBe("fresh");
    await expect(duplicateFreshRequest).resolves.toBe("fresh");
  });

  it("evicts the least recently used entry when the cache reaches its limit", async () => {
    for (let index = 0; index <= MAX_QUERY_CACHE_ENTRIES; index += 1) {
      setCachedQuery(`test:lru:${index}`, index, 60_000);
    }
    const load = vi.fn(async () => "refetched");

    await expect(getCachedQuery("test:lru:0", load, 60_000)).resolves.toBe(
      "refetched",
    );
    expect(load).toHaveBeenCalledOnce();
  });

  it("aborts a pending loader when its key is invalidated", () => {
    let signal: AbortSignal | undefined;
    void getCachedQuery(
      "test:abort",
      (nextSignal) => {
        signal = nextSignal;
        return new Promise<string>(() => undefined);
      },
      60_000,
    );

    invalidateCachedQuery("test:abort");
    expect(signal?.aborted).toBe(true);
  });
});

import { developmentCacheDisabled } from "@/lib/config/development-cache";

type CacheEntry<T> = { value: T; expiresAt: number };
type PendingEntry<T> = { promise: Promise<T>; controller: AbortController };
export const MAX_QUERY_CACHE_ENTRIES = 200;
export const DEFAULT_QUERY_CACHE_TTL_MS = 2 * 60 * 1000;

type QueryOptions<T> = {
  signal?: AbortSignal;
  ttlMs?: number;
  transform?: (value: T) => T;
};

export function createQueryCache<T>({
  maxEntries = MAX_QUERY_CACHE_ENTRIES,
} = {}) {
  const values = new Map<string, CacheEntry<T>>();
  const pending = new Map<string, PendingEntry<T>>();
  let generation = 0;

  function evictExpiredEntries() {
    const now = Date.now();
    for (const [key, entry] of values) {
      if (entry.expiresAt <= now) values.delete(key);
    }
  }
  function promote(key: string, entry: CacheEntry<T>) {
    values.delete(key);
    values.set(key, entry);
    while (values.size > maxEntries) {
      const oldestKey = values.keys().next().value;
      if (oldestKey === undefined) break;
      values.delete(oldestKey);
    }
  }
  function snapshot(key: string): T | undefined {
    if (developmentCacheDisabled) return undefined;
    evictExpiredEntries();
    const cached = values.get(key);
    if (!cached) return undefined;
    promote(key, cached);
    return cached.value;
  }
  function set(key: string, value: T, ttlMs = DEFAULT_QUERY_CACHE_TTL_MS) {
    if (developmentCacheDisabled) return;
    evictExpiredEntries();
    promote(key, { value, expiresAt: Date.now() + ttlMs });
  }
  function invalidate(key: string) {
    values.delete(key);
    pending.get(key)?.controller.abort();
    pending.delete(key);
  }
  function invalidatePrefix(prefix: string) {
    for (const key of new Set([...values.keys(), ...pending.keys()])) {
      if (key.startsWith(prefix)) invalidate(key);
    }
  }
  function clear() {
    generation += 1;
    values.clear();
    for (const key of pending.keys()) invalidate(key);
  }
  function get(
    key: string,
    load: (signal: AbortSignal) => Promise<T>,
    {
      signal,
      ttlMs = DEFAULT_QUERY_CACHE_TTL_MS,
      transform,
    }: QueryOptions<T> = {},
  ): Promise<T> {
    signal?.throwIfAborted();
    const cached = snapshot(key);
    if (cached !== undefined) return Promise.resolve(cached);
    const requestGeneration = generation;
    const commit = (value: T, requestSignal: AbortSignal) => {
      if (requestSignal.aborted || requestGeneration !== generation)
        return value;
      const result = transform ? transform(value) : value;
      set(key, result, ttlMs);
      return result;
    };
    // A caller-owned signal must not cancel another consumer's shared request.
    if (signal) {
      return load(signal).then((value) => {
        signal.throwIfAborted();
        return commit(value, signal);
      });
    }
    const active = pending.get(key);
    if (active) return active.promise;
    const controller = new AbortController();
    const request = load(controller.signal)
      .then((value) => commit(value, controller.signal))
      .finally(() => {
        if (pending.get(key)?.promise === request) pending.delete(key);
      });
    pending.set(key, { promise: request, controller });
    return request;
  }
  return { get, snapshot, set, invalidate, invalidatePrefix, clear };
}

const queryCache = createQueryCache<unknown>();

export function getCachedQuery<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  ttlMs = DEFAULT_QUERY_CACHE_TTL_MS,
): Promise<T> {
  return queryCache.get(key, load, { ttlMs }) as Promise<T>;
}
export function getCachedQuerySnapshot<T>(key: string): T | undefined {
  return queryCache.snapshot(key) as T | undefined;
}
export const setCachedQuery = queryCache.set;
export const invalidateCachedQuery = queryCache.invalidate;
export const invalidateCachedQueries = queryCache.invalidatePrefix;
export const clearCachedQueries = queryCache.clear;

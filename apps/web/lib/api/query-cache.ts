import { developmentCacheDisabled } from "@/lib/config/development-cache";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

type PendingEntry<T> = {
  promise: Promise<T>;
  controller: AbortController;
};

export const MAX_QUERY_CACHE_ENTRIES = 200;
const values = new Map<string, CacheEntry<unknown>>();
const pending = new Map<string, PendingEntry<unknown>>();
let cacheGeneration = 0;

function evictExpiredEntries(now = Date.now()) {
  for (const [key, entry] of values) {
    if (entry.expiresAt <= now) values.delete(key);
  }
}

function setCacheEntry<T>(key: string, entry: CacheEntry<T>) {
  values.delete(key);
  values.set(key, entry);
  while (values.size > MAX_QUERY_CACHE_ENTRIES) {
    const oldestKey = values.keys().next().value;
    if (!oldestKey) return;
    values.delete(oldestKey);
  }
}

function abortPendingQuery(key: string) {
  const active = pending.get(key);
  if (!active) return;
  active.controller.abort();
  pending.delete(key);
}

/** Small shared read cache with in-flight request deduplication. */
export function getCachedQuery<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  ttlMs: number,
): Promise<T> {
  evictExpiredEntries();
  const cached = values.get(key) as CacheEntry<T> | undefined;
  if (!developmentCacheDisabled && cached) {
    setCacheEntry(key, cached);
    return Promise.resolve(cached.value);
  }

  const active = pending.get(key) as PendingEntry<T> | undefined;
  if (active) return active.promise;

  const requestGeneration = cacheGeneration;
  const controller = new AbortController();
  const request = load(controller.signal)
    .then((value) => {
      if (!developmentCacheDisabled && requestGeneration === cacheGeneration) {
        setCacheEntry(key, { value, expiresAt: Date.now() + ttlMs });
      }
      return value;
    })
    .finally(() => {
      if (pending.get(key)?.promise === request) pending.delete(key);
    });
  pending.set(key, { promise: request, controller });
  return request;
}

export function setCachedQuery<T>(key: string, value: T, ttlMs: number) {
  if (developmentCacheDisabled) return;
  evictExpiredEntries();
  setCacheEntry(key, { value, expiresAt: Date.now() + ttlMs });
}

export function invalidateCachedQuery(key: string) {
  values.delete(key);
  abortPendingQuery(key);
}

/** Clears all session-bound query data and prevents older requests from repopulating it. */
export function clearCachedQueries() {
  cacheGeneration += 1;
  values.clear();
  for (const key of pending.keys()) abortPendingQuery(key);
}

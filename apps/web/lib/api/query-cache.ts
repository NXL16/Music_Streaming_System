import { developmentCacheDisabled } from "@/lib/config/development-cache";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const values = new Map<string, CacheEntry<unknown>>();
const pending = new Map<string, Promise<unknown>>();
let cacheGeneration = 0;

/** Small shared read cache with in-flight request deduplication. */
export function getCachedQuery<T>(
  key: string,
  load: () => Promise<T>,
  ttlMs: number,
): Promise<T> {
  const cached = values.get(key) as CacheEntry<T> | undefined;
  if (!developmentCacheDisabled && cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.value);
  }

  const active = pending.get(key) as Promise<T> | undefined;
  if (active) return active;

  const requestGeneration = cacheGeneration;
  const request = load()
    .then((value) => {
      if (!developmentCacheDisabled && requestGeneration === cacheGeneration) {
        values.set(key, { value, expiresAt: Date.now() + ttlMs });
      }
      return value;
    })
    .finally(() => {
      if (pending.get(key) === request) pending.delete(key);
    });
  pending.set(key, request);
  return request;
}

export function setCachedQuery<T>(key: string, value: T, ttlMs: number) {
  if (developmentCacheDisabled) return;
  values.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function invalidateCachedQuery(key: string) {
  values.delete(key);
}

/** Clears all session-bound query data and prevents older requests from repopulating it. */
export function clearCachedQueries() {
  cacheGeneration += 1;
  values.clear();
  pending.clear();
}

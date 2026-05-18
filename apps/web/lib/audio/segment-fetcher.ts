import { LRUCache } from "./lru-cache";

interface FetchRangeParams {
  url: string;
  start: number;
  end: number;
  signal?: AbortSignal;
  cacheKey?: string;
  cache: LRUCache<string, ArrayBuffer>;
  readCache?: boolean;
  writeCache?: boolean;
  sessionId: number;
  getCurrentSessionId: () => number;
}

const inFlightFetches = new Map<string, Promise<ArrayBuffer | null>>();

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 2,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, init);

      if (response.status >= 500 && attempt < retries) {
        await sleep(300 * (attempt + 1));
        continue;
      }

      return response;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw err;
      }

      if (attempt >= retries) {
        throw err;
      }

      await sleep(300 * (attempt + 1));
    }
  }

  throw new Error("Fetch failed after retries");
}

export async function fetchRange({
  url,
  start,
  end,
  signal,
  cacheKey,
  cache,
  readCache = true,
  writeCache = true,
  sessionId,
  getCurrentSessionId,
}: FetchRangeParams): Promise<ArrayBuffer | null> {
  if (cacheKey && readCache) {
    const cached = cache.get(cacheKey);

    if (cached) return cached;
  }

  // Include sessionId in inflight cache key to prevent cross-session request reuse
  const inflightKey = cacheKey ? `${cacheKey}:sid${sessionId}` : null;

  if (inflightKey) {
    const inflight = inFlightFetches.get(inflightKey);
    if (inflight && sessionId === getCurrentSessionId()) {
      return inflight;
    }
  }

  const fetchPromise = (async () => {
    let response: Response;

    try {
      response = await fetchWithRetry(url, {
        headers: {
          Range: `bytes=${start}-${end}`,
        },
        signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return null;
      }

      throw err;
    }

    if (sessionId !== getCurrentSessionId()) return null;

    if (!response.ok || (response.status !== 206 && response.status !== 200)) {
      return null;
    }

    const data = await response.arrayBuffer();

    if (cacheKey && writeCache && data.byteLength > 0) {
      cache.set(cacheKey, data);
    }

    return data;
  })();

  if (inflightKey) {
    inFlightFetches.set(inflightKey, fetchPromise);
  }

  try {
    return await fetchPromise;
  } finally {
    if (inflightKey) {
      inFlightFetches.delete(inflightKey);
    }
  }
}

"use client";

import { useCallback, useMemo } from "react";
import {
  getCachedQuery,
  DEFAULT_QUERY_CACHE_TTL_MS,
  getCachedQuerySnapshot,
  invalidateCachedQuery,
} from "./query-cache";
import { useAsyncResource } from "./use-async-resource";

export function useCachedQuery<T>(
  key: string,
  fetchData: (signal: AbortSignal) => Promise<T>,
  fallbackErrorMessage: string,
  { enabled = true, ttlMs = DEFAULT_QUERY_CACHE_TTL_MS } = {},
) {
  const initialData = useMemo(() => getCachedQuerySnapshot<T>(key), [key]);
  const load = useCallback(
    () => getCachedQuery(key, fetchData, ttlMs),
    [key, fetchData, ttlMs],
  );
  const resource = useAsyncResource(load, fallbackErrorMessage, {
    initialData,
    enabled,
  });
  const reloadResource = resource.reload;
  const reload = useCallback(() => {
    invalidateCachedQuery(key);
    return reloadResource();
  }, [key, reloadResource]);
  return { ...resource, reload };
}

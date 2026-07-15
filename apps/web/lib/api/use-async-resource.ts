"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "./api-error";

type ResourceLoader<T> = (signal?: AbortSignal) => Promise<T>;

/** Shared lifecycle for simple client-side read requests. */
export function useAsyncResource<T>(
  loadResource: ResourceLoader<T>,
  fallbackErrorMessage: string,
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");

      try {
        const nextData = await loadResource(signal);
        if (!signal?.aborted) setData(nextData);
        return nextData;
      } catch (requestError) {
        if (!signal?.aborted) {
          setError(getApiErrorMessage(requestError, fallbackErrorMessage));
        }
        return null;
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [fallbackErrorMessage, loadResource],
  );

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void load(controller.signal);
    });

    return () => controller.abort();
  }, [load]);

  return { data, loading, error, reload: load };
}

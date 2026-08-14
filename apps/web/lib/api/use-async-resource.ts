"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getApiErrorMessage } from "./api-error";
import { useMinimumLoadingState } from "@/lib/loading/use-minimum-loading-duration";

type ResourceLoader<T> = (signal?: AbortSignal) => Promise<T>;

/** Shared lifecycle for simple client-side read requests. */
export function useAsyncResource<T>(
  loadResource: ResourceLoader<T>,
  fallbackErrorMessage: string,
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useMinimumLoadingState(true);
  const [error, setError] = useState("");
  const requestVersion = useRef(0);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const version = ++requestVersion.current;
      setLoading(true);
      setError("");

      try {
        const nextData = await loadResource(signal);
        if (!signal?.aborted && requestVersion.current === version) {
          setData(nextData);
        }
        return nextData;
      } catch (requestError) {
        if (!signal?.aborted && requestVersion.current === version) {
          setError(getApiErrorMessage(requestError, fallbackErrorMessage));
        }
        return null;
      } finally {
        if (!signal?.aborted && requestVersion.current === version) {
          setLoading(false);
        }
      }
    },
    [fallbackErrorMessage, loadResource, setLoading],
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

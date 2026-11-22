"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getApiErrorMessage, getApiErrorStatus } from "./api-error";
import { useMinimumLoadingState } from "@/lib/loading/use-minimum-loading-duration";

type ResourceLoader<T> = (signal?: AbortSignal) => Promise<T>;

export function useAsyncResource<T>(
  loadResource: ResourceLoader<T>,
  fallbackErrorMessage: string,
  options?: { initialData?: T; enabled?: boolean },
) {
  const initialData = options?.initialData;
  const hasInitialData = initialData !== undefined;
  const enabled = options?.enabled ?? true;
  const [result, setResult] = useState<{
    loader: ResourceLoader<T>;
    data: T | null;
    error: string;
    errorStatus?: number;
  }>(() => ({ loader: loadResource, data: initialData ?? null, error: "" }));
  const [loading, setLoading] = useMinimumLoadingState(
    !hasInitialData && enabled,
  );
  const activeRequest = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setResult((current) => ({
      loader: loadResource,
      data:
        current.loader === loadResource ? current.data : (initialData ?? null),
      error: "",
    }));

    try {
      const nextData = await loadResource(controller.signal);
      if (!controller.signal.aborted) {
        setResult({ loader: loadResource, data: nextData, error: "" });
      }
      return nextData;
    } catch (requestError) {
      if (!controller.signal.aborted) {
        setResult((current) => ({
          ...current,
          loader: loadResource,
          error: getApiErrorMessage(requestError, fallbackErrorMessage),
          errorStatus: getApiErrorStatus(requestError),
        }));
      }
      return null;
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [fallbackErrorMessage, initialData, loadResource, setLoading]);

  useEffect(() => {
    let active = true;
    if (!hasInitialData && enabled) {
      queueMicrotask(() => {
        if (active) void load();
      });
    }

    return () => {
      active = false;
      activeRequest.current?.abort();
    };
  }, [enabled, hasInitialData, load]);

  const current = result.loader === loadResource;
  return {
    data: current ? result.data : (initialData ?? null),
    loading: enabled && (current ? loading : !hasInitialData),
    error: current ? result.error : "",
    errorStatus: current ? result.errorStatus : undefined,
    reload: load,
  };
}

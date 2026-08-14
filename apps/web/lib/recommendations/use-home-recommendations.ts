"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCachedHomeRecommendations,
  getHomeRecommendations,
  invalidateHomeRecommendationsCache,
} from "./recommendation.api";
import type { RecommendationResponse } from "./recommendation.types";
import { useMinimumLoadingState } from "@/lib/loading/use-minimum-loading-duration";

export function useHomeRecommendations() {
  const cached = getCachedHomeRecommendations();
  const [data, setData] = useState<RecommendationResponse | null>(cached);
  const [loading, setLoading] = useMinimumLoadingState(cached === null);
  // A snapshot is valid UI for instant Back navigation. Revalidate on every
  // mount; the API layer coalesces requests and serves a fresh cache without
  // a network call, while stale data refreshes in the background.
  const [needsInitialRequest] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const refresh = useCallback(
    async (showLoading = false, signal?: AbortSignal, force = false) => {
      if (signal?.aborted) return;
      const version = ++requestVersion.current;
      if (force) invalidateHomeRecommendationsCache();
      if (showLoading) setLoading(true);

      try {
        const nextData = await getHomeRecommendations();
        if (signal?.aborted || requestVersion.current !== version) return;
        setData(nextData);
        setError(null);
      } catch {
        if (signal?.aborted || requestVersion.current !== version) return;
        setError("Không thể tải nội dung đề xuất.");
      } finally {
        if (!signal?.aborted && requestVersion.current === version) {
          setLoading(false);
        }
      }
    },
    [setLoading],
  );

  useEffect(() => {
    if (!needsInitialRequest) return;
    const controller = new AbortController();
    queueMicrotask(() => void refresh(false, controller.signal));

    return () => {
      requestVersion.current += 1;
      controller.abort();
    };
  }, [needsInitialRequest, refresh]);

  const retry = useCallback(() => refresh(true, undefined, true), [refresh]);

  return { data, loading, error, refresh, retry };
}

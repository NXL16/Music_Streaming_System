"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getCachedHomeRecommendations,
  getHomeRecommendations,
  invalidateHomeRecommendationsCache,
} from "./recommendation.api";
import type { RecommendationResponse } from "./recommendation.types";

export function useHomeRecommendations() {
  const cached = getCachedHomeRecommendations();
  const [data, setData] = useState<RecommendationResponse | null>(cached);
  const [loading, setLoading] = useState(cached === null);
  const [needsInitialRequest] = useState(cached === null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (showLoading = false, signal?: AbortSignal, force = false) => {
      if (signal?.aborted) return;
      if (force) invalidateHomeRecommendationsCache();
      if (showLoading) setLoading(true);

      try {
        const nextData = await getHomeRecommendations();
        if (signal?.aborted) return;
        setData(nextData);
        setError(null);
      } catch {
        if (signal?.aborted) return;
        setError("Không thể tải nội dung đề xuất.");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!needsInitialRequest) return;
    const controller = new AbortController();
    queueMicrotask(() => void refresh(false, controller.signal));

    return () => {
      controller.abort();
    };
  }, [needsInitialRequest, refresh]);

  const retry = useCallback(() => refresh(true, undefined, true), [refresh]);

  return { data, loading, error, refresh, retry };
}

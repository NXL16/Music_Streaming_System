"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCachedHomeRecommendations,
  getHomeRecommendations,
  invalidateHomeRecommendationsCache,
} from "./recommendation.api";
import { HOME_RECOMMENDATIONS_STALE_EVENT } from "./home-revalidation";
import type { RecommendationResponse } from "./recommendation.types";
import { useMinimumLoadingState } from "@/lib/loading/use-minimum-loading-duration";

function homeScope(data: RecommendationResponse | null): "global" | "user" | null {
  if (!data) return null;
  return data.data.some((section) => section.id.startsWith("user-"))
    ? "user"
    : "global";
}

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
  const visibleScope = useRef(homeScope(cached));

  const refresh = useCallback(
    async (showLoading = false, signal?: AbortSignal, force = false) => {
      if (signal?.aborted) return;
      const version = ++requestVersion.current;
      if (force) invalidateHomeRecommendationsCache();
      if (showLoading) setLoading(true);

      try {
        const nextData = await getHomeRecommendations();
        if (signal?.aborted || requestVersion.current !== version) return;
        if (
          visibleScope.current === "global" &&
          homeScope(nextData) === "user"
        ) {
          return;
        }
        visibleScope.current = homeScope(nextData);
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

  useEffect(() => {
    // Listening/preference telemetry marks the server page stale. Let its
    // background regeneration finish, then replace the visible Home once;
    // debouncing collapses an outbox flush into one revalidation.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const revalidate = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void refresh(false, undefined, true);
      }, 3_000);
    };
    window.addEventListener(HOME_RECOMMENDATIONS_STALE_EVENT, revalidate);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(HOME_RECOMMENDATIONS_STALE_EVENT, revalidate);
    };
  }, [refresh]);

  const retry = useCallback(() => refresh(true, undefined, true), [refresh]);

  return { data, loading, error, refresh, retry };
}

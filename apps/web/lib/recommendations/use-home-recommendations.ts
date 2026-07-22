"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getCachedHomeRecommendations,
  getHomeRecommendations,
  invalidateHomeRecommendationsCache,
} from "./recommendation.api";
import type { RecommendationResponse } from "./recommendation.types";
import {
  HOME_RECOMMENDATIONS_REFRESH_EVENT,
  RECENTLY_PLAYED_ITEM_EVENT,
} from "./listening-events";
import type { MediaCardProps } from "@/components/media/media-card.types";

const MAX_RECENTLY_PLAYED_OVERLAY_ITEMS = 24;
export function useHomeRecommendations() {
  // Nếu splash đã prefetch xong, dùng luôn cache → không hiện skeleton lại.
  const cached = getCachedHomeRecommendations();
  const [data, setData] = useState<RecommendationResponse | null>(cached);
  const [recentlyPlayedItems, setRecentlyPlayedItems] = useState<
    MediaCardProps[]
  >([]);
  const [loading, setLoading] = useState(cached === null);
  const [needsInitialRequest] = useState(cached === null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (
    showLoading = false,
    signal?: AbortSignal,
    force = false,
  ) => {
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
  }, []);

  useEffect(() => {
    if (!needsInitialRequest) return;
    const controller = new AbortController();
    queueMicrotask(() => void refresh(false, controller.signal));

    return () => {
      controller.abort();
    };
  }, [needsInitialRequest, refresh]);

  useEffect(() => {
    const handleRecommendationRefresh = () => refresh(false);
    window.addEventListener(
      HOME_RECOMMENDATIONS_REFRESH_EVENT,
      handleRecommendationRefresh,
    );
    return () => {
      window.removeEventListener(
        HOME_RECOMMENDATIONS_REFRESH_EVENT,
        handleRecommendationRefresh,
      );
    };
  }, [refresh]);

  useEffect(() => {
    const handleRecentlyPlayedItem = (event: Event) => {
      const item = (event as CustomEvent<MediaCardProps>).detail;
      if (!item) return;

      setRecentlyPlayedItems((currentItems) => {
        const itemKey = `${item.resourceType}:${item.resourceId}`;
        const nextItems = [
          item,
          ...currentItems.filter(
            (currentItem) =>
              `${currentItem.resourceType}:${currentItem.resourceId}` !==
              itemKey,
          ),
        ];

        return nextItems.slice(0, MAX_RECENTLY_PLAYED_OVERLAY_ITEMS);
      });
    };

    window.addEventListener(
      RECENTLY_PLAYED_ITEM_EVENT,
      handleRecentlyPlayedItem,
    );

    return () => {
      window.removeEventListener(
        RECENTLY_PLAYED_ITEM_EVENT,
        handleRecentlyPlayedItem,
      );
    };
  }, []);

  const retry = useCallback(() => refresh(true, undefined, true), [refresh]);

  return { data, loading, error, refresh, retry, recentlyPlayedItems };
}

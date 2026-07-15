"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getCachedHomeRecommendations,
  getHomeRecommendations,
} from "./recommendation.api";
import type { RecommendationResponse } from "./recommendation.types";
import { RECENTLY_PLAYED_ITEM_EVENT } from "./listening-events";
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
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback((showLoading = false, signal?: AbortSignal) => {
    if (signal?.aborted) return;
    if (showLoading) setLoading(true);

    getHomeRecommendations()
      .then((nextData) => {
        if (signal?.aborted) return;
        setData(nextData);
        setError(null);
      })
      .catch(() => {
        if (signal?.aborted) return;
        setError("Không thể tải nội dung đề xuất.");
      })
      .finally(() => {
        if (signal?.aborted) return;
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => refresh(false, controller.signal));

    return () => {
      controller.abort();
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

  return { data, loading, error, refresh, recentlyPlayedItems };
}

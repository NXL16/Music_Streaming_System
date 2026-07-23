"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MediaCardProps } from "@/components/media/media-card.types";
import { RECENTLY_PLAYED_CONTEXT_LIMIT } from "@musical/shared-constants";
import {
  mapHomeRecommendations,
  type HomeShelf,
} from "./recommendation.mapper";
import { getRecommendationSection } from "./recommendation.api";
import { RECENTLY_PLAYED_ITEM_EVENT } from "./listening-events";

const RECENTLY_PLAYED_SHELF_ID = "user-recently-played";

function itemKey(item: Pick<MediaCardProps, "resourceType" | "resourceId">) {
  return `${item.resourceType}:${item.resourceId}`;
}

function mergeRecentlyPlayedItems(
  optimisticItems: MediaCardProps[],
  serverItems: MediaCardProps[],
) {
  const seen = new Set<string>();

  return [...optimisticItems, ...serverItems]
    .filter((item) => {
      const key = itemKey(item);
      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    })
    .slice(0, RECENTLY_PLAYED_CONTEXT_LIMIT);
}

export function useRecentlyPlayedSection() {
  const [serverShelf, setServerShelf] = useState<HomeShelf | null>(null);
  const [optimisticItems, setOptimisticItems] = useState<MediaCardProps[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);

    try {
      const response = await getRecommendationSection(RECENTLY_PLAYED_SHELF_ID);

      const nextShelf = mapHomeRecommendations(response).find(
        (shelf) => shelf.id === RECENTLY_PLAYED_SHELF_ID,
      );

      setServerShelf(nextShelf ?? null);
    } catch {
      setServerShelf(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);

  useEffect(() => {
    const handleRecentlyPlayedItem = (event: Event) => {
      const item = (event as CustomEvent<MediaCardProps>).detail;
      if (!item) return;

      setOptimisticItems((currentItems) => {
        const nextItems = [
          item,
          ...currentItems.filter(
            (currentItem) => itemKey(currentItem) !== itemKey(item),
          ),
        ];

        return nextItems.slice(0, RECENTLY_PLAYED_CONTEXT_LIMIT);
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

  const shelf = useMemo(() => {
    if (!serverShelf && optimisticItems.length === 0) return null;

    const fallbackShelf = {
      id: RECENTLY_PLAYED_SHELF_ID,
      title: "Recently Played",
      displayKind: "MusicCoverShelf",
      sourceDisplayKind: "MusicCoverShelf",
      modelVersion: 1,
      hasMore: false,
      items: [],
    } satisfies HomeShelf;

    const baseShelf = serverShelf ?? fallbackShelf;
    const mergedItems = mergeRecentlyPlayedItems(
      optimisticItems,
      baseShelf.items,
    );

    return {
      ...baseShelf,
      items: mergedItems,
    };
  }, [optimisticItems, serverShelf]);

  return {
    shelf,
    loading,
    refresh,
  };
}

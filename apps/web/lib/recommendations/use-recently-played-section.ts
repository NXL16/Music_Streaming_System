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
import {
  normalizeRecentlyPlayedCard,
  RECENTLY_PLAYED_SHELF_ID,
} from "./recently-played-presentation";
import {
  getRecentlyPlayedSnapshot,
  RECENTLY_PLAYED_PLAYLIST_REMOVED_EVENT,
  setRecentlyPlayedSnapshot,
} from "./recently-played-snapshot";
import { developmentCacheDisabled } from "@/lib/config/development-cache";
import { useMinimumLoadingState } from "@/lib/loading/use-minimum-loading-duration";

// This is a view snapshot, not a second API cache: it keeps the already
// rendered Home cards mounted in memory across client navigation so Back can
// restore the viewport without showing a new skeleton.
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
  const initialShelf = developmentCacheDisabled
    ? undefined
    : getRecentlyPlayedSnapshot();
  const [serverShelf, setServerShelf] = useState<HomeShelf | null>(
    initialShelf ?? null,
  );
  const [optimisticItems, setOptimisticItems] = useState<MediaCardProps[]>([]);
  const [loading, setLoading] = useMinimumLoadingState(
    initialShelf === undefined,
  );

  const refresh = useCallback(async () => {
    if (developmentCacheDisabled || getRecentlyPlayedSnapshot() === undefined) {
      setLoading(true);
    }

    try {
      const response = await getRecommendationSection(RECENTLY_PLAYED_SHELF_ID);

      const nextShelf = mapHomeRecommendations(response).find(
        (shelf) => shelf.id === RECENTLY_PLAYED_SHELF_ID,
      );

      const nextSnapshot = nextShelf ?? null;
      if (!developmentCacheDisabled) setRecentlyPlayedSnapshot(nextSnapshot);
      setServerShelf(nextSnapshot);
    } catch {
      if (!developmentCacheDisabled) setRecentlyPlayedSnapshot(null);
      setServerShelf(null);
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  useEffect(() => {
    if (!developmentCacheDisabled && getRecentlyPlayedSnapshot() !== undefined)
      return;
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
  }, [setLoading]);

  useEffect(() => {
    const handlePlaylistRemoved = (event: Event) => {
      const playlistId = (event as CustomEvent<string>).detail;
      if (!playlistId) return;

      setOptimisticItems((items) =>
        items.filter((item) => item.resourceId !== playlistId),
      );
      setServerShelf((current) =>
        current
          ? {
              ...current,
              items: current.items.filter(
                (item) => item.resourceId !== playlistId,
              ),
            }
          : null,
      );
    };

    window.addEventListener(
      RECENTLY_PLAYED_PLAYLIST_REMOVED_EVENT,
      handlePlaylistRemoved,
    );
    return () =>
      window.removeEventListener(
        RECENTLY_PLAYED_PLAYLIST_REMOVED_EVENT,
        handlePlaylistRemoved,
      );
  }, [setLoading]);

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
      displayKind: "MusicCoverShelf" as const,
      sourceDisplayKind: "MusicCoverShelf",
      items: mergedItems.map(normalizeRecentlyPlayedCard),
    };
  }, [optimisticItems, serverShelf]);

  return {
    shelf,
    loading,
    refresh,
  };
}

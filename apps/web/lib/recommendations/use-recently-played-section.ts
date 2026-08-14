"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MediaCardProps } from "@/components/media/media-card.types";
import { RECENTLY_PLAYED_CONTEXT_LIMIT } from "@musical/shared-constants";
import {
  mapHomeRecommendations,
  type HomeShelf,
} from "./recommendation.mapper";
import { getRecommendationSection } from "./recommendation.api";
import {
  RECENTLY_PLAYED_ITEM_EVENT,
  RECENTLY_PLAYED_ITEM_REJECTED_EVENT,
} from "./listening-events";
import {
  normalizeRecentlyPlayedCard,
  RECENTLY_PLAYED_SHELF_ID,
} from "./recently-played-presentation";
import {
  getRecentlyPlayedSnapshot,
  isRecentlyPlayedSnapshotStale,
  RECENTLY_PLAYED_PLAYLIST_REMOVED_EVENT,
  RECENTLY_PLAYED_PLAYLIST_RESTORED_EVENT,
  RECENTLY_PLAYED_PLAYLIST_UPDATED_EVENT,
  setRecentlyPlayedSnapshot,
  type RecentlyPlayedPlaylistSnapshotEntry,
  type RecentlyPlayedPlaylistSnapshotUpdate,
} from "./recently-played-snapshot";
import { developmentCacheDisabled } from "@/lib/config/development-cache";
import { useMinimumLoadingState } from "@/lib/loading/use-minimum-loading-duration";
import type { MediaArtwork } from "@/lib/media/media-card.types";
import { getCoverArtwork } from "@/lib/media/artwork-slots";
import { listFavoriteSongs } from "@/lib/songs/song.api";

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

async function hydrateFavoriteArtwork(shelf: HomeShelf | undefined) {
  const hasFavorite = shelf?.items.some(
    (item) =>
      item.resourceType === "playlists" && item.resourceId === "favorite",
  );
  if (!shelf || !hasFavorite) return shelf;

  try {
    const { collection } = await listFavoriteSongs({ limit: 1 });
    const artwork = collection?.artwork as MediaArtwork | undefined;
    const { imageUrl, imageSrcSet } = getCoverArtwork(artwork);
    if (!imageSrcSet) return shelf;

    const color = artwork?.bgColor?.replace(/^#/, "") || "2c2c2e";
    return {
      ...shelf,
      items: shelf.items.map((item) =>
        item.resourceType === "playlists" && item.resourceId === "favorite"
          ? {
              ...item,
              artwork,
              imageUrl: imageUrl || item.imageUrl,
              imageSrcSet,
              artworkColors: {
                ...item.artworkColors,
                bg: `#${color}`,
                main: `#${color}`,
              },
            }
          : item,
      ),
    };
  } catch {
    return shelf;
  }
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

      const nextShelf = await hydrateFavoriteArtwork(
        mapHomeRecommendations(response).find(
          (shelf) => shelf.id === RECENTLY_PLAYED_SHELF_ID,
        ),
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
    if (!developmentCacheDisabled && !isRecentlyPlayedSnapshotStale()) return;
    queueMicrotask(() => void refresh());
  }, [refresh]);

  useEffect(() => {
    const refreshIfStale = () => {
      if (
        document.visibilityState !== "hidden" &&
        isRecentlyPlayedSnapshotStale()
      ) {
        void refresh();
      }
    };
    window.addEventListener("focus", refreshIfStale);
    document.addEventListener("visibilitychange", refreshIfStale);
    return () => {
      window.removeEventListener("focus", refreshIfStale);
      document.removeEventListener("visibilitychange", refreshIfStale);
    };
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
    const handleRecentlyPlayedItemRejected = (event: Event) => {
      const item = (event as CustomEvent<MediaCardProps>).detail;
      if (!item) return;
      setOptimisticItems((items) =>
        items.filter((current) => itemKey(current) !== itemKey(item)),
      );
      void refresh();
    };
    window.addEventListener(
      RECENTLY_PLAYED_ITEM_REJECTED_EVENT,
      handleRecentlyPlayedItemRejected,
    );
    return () =>
      window.removeEventListener(
        RECENTLY_PLAYED_ITEM_REJECTED_EVENT,
        handleRecentlyPlayedItemRejected,
      );
  }, [refresh]);

  useEffect(() => {
    const handlePlaylistRestored = (event: Event) => {
      const entry = (event as CustomEvent<RecentlyPlayedPlaylistSnapshotEntry>)
        .detail;
      if (!entry) return;

      setServerShelf((current) => {
        if (!current) return current;

        const items = current.items.filter(
          (item) => item.resourceId !== entry.item.resourceId,
        );
        return {
          ...current,
          items: [
            ...items.slice(0, entry.index),
            entry.item,
            ...items.slice(entry.index),
          ],
        };
      });
    };

    window.addEventListener(
      RECENTLY_PLAYED_PLAYLIST_RESTORED_EVENT,
      handlePlaylistRestored,
    );
    return () =>
      window.removeEventListener(
        RECENTLY_PLAYED_PLAYLIST_RESTORED_EVENT,
        handlePlaylistRestored,
      );
  }, []);

  useEffect(() => {
    const handlePlaylistUpdated = (event: Event) => {
      const update = (
        event as CustomEvent<RecentlyPlayedPlaylistSnapshotUpdate>
      ).detail;
      if (!update) return;

      const updateItem = (item: MediaCardProps) =>
        item.resourceId === update.playlistId
          ? { ...item, title: update.title }
          : item;

      setOptimisticItems((items) => items.map(updateItem));
      setServerShelf((current) =>
        current
          ? { ...current, items: current.items.map(updateItem) }
          : current,
      );
    };

    window.addEventListener(
      RECENTLY_PLAYED_PLAYLIST_UPDATED_EVENT,
      handlePlaylistUpdated,
    );
    return () =>
      window.removeEventListener(
        RECENTLY_PLAYED_PLAYLIST_UPDATED_EVENT,
        handlePlaylistUpdated,
      );
  }, []);

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

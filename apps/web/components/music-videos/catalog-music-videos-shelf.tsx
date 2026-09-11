"use client";

import { useCallback, useEffect, type CSSProperties } from "react";
import MediaShelf from "@/components/media/media-shelf";
import type { MediaCardProps } from "@/lib/media/media-card.types";
import {
  getCatalogMusicVideos,
  type MusicVideoCatalogResourceType,
} from "@/lib/catalog/music-videos.api";
import { useAsyncResource } from "@/lib/api/use-async-resource";
import { mapCatalogMusicVideoCards } from "@/lib/catalog/music-video-cards";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useFavoriteStore } from "@/lib/favorites/use-favorite-store";
import { preloadAmbientHlsRuntime } from "@/components/custom-elements/ambient-hls-player";

export const ARTIST_MUSIC_VIDEO_GRID_STYLE = {
  "--grid-max-content-xsmall": "200px",
  "--grid-column-gap-xsmall": "10px",
  "--grid-row-gap-xsmall": "24px",
  "--grid-small": "3",
  "--grid-column-gap-small": "20px",
  "--grid-row-gap-small": "24px",
  "--grid-medium": "4",
  "--grid-column-gap-medium": "20px",
  "--grid-row-gap-medium": "24px",
  "--grid-large": "5",
  "--grid-column-gap-large": "20px",
  "--grid-row-gap-large": "24px",
  "--grid-xlarge": "5",
  "--grid-column-gap-xlarge": "20px",
  "--grid-row-gap-xlarge": "24px",
  "--grid-type": "C",
  "--grid-rows": "1",
  "--standard-lockup-shadow-offset": "15px",
} as CSSProperties;

type CatalogMusicVideosShelfProps = {
  resourceType: MusicVideoCatalogResourceType;
  resourceId: string;
  title?: string;
  excludeVideoId?: string;
  previewLimit?: number;
  onOpenDetail?: (shelf: { title: string; items: MediaCardProps[] }) => void;
};

/** Shared Music Video shelf for a Song, Album, or Artist catalog page. */
export function CatalogMusicVideosShelf({
  resourceType,
  resourceId,
  title = "Music Videos",
  excludeVideoId,
  previewLimit,
  onOpenDetail,
}: CatalogMusicVideosShelfProps) {
  const userId = useAuthStore((state) => state.user?.userId);
  const hydrateFavorites = useFavoriteStore((state) => state.hydrate);
  const isArtistShelf = resourceType === "artists";
  const key = `${resourceType}:${resourceId}`;
  const loadVideos = useCallback(
    (signal?: AbortSignal) =>
      getCatalogMusicVideos(resourceType, resourceId, signal),
    [resourceId, resourceType],
  );
  const { data: videos } = useAsyncResource(
    loadVideos,
    "Không thể tải music videos.",
  );
  useEffect(() => {
    if (userId) void hydrateFavorites();
  }, [hydrateFavorites, userId]);
  useEffect(() => {
    if (videos?.length) preloadAmbientHlsRuntime();
  }, [videos?.length]);
  if (!videos?.length) return null;

  const cards: MediaCardProps[] = mapCatalogMusicVideoCards(
    videos.filter((video) => video.id !== excludeVideoId),
    { artistShelf: isArtistShelf },
  );
  if (!cards.length) return null;

  const visibleCards = previewLimit ? cards.slice(0, previewLimit) : cards;
  const hasMore = Boolean(previewLimit && cards.length > previewLimit);

  return (
    <MediaShelf
      title={title}
      displayKind="MusicVideoShelf"
      items={visibleCards}
      shelfId={`catalog-music-videos-${key}`}
      gridStyle={isArtistShelf ? ARTIST_MUSIC_VIDEO_GRID_STYLE : undefined}
      {...(!isArtistShelf
        ? { containerClassName: "bg-(--opaqueShelfBG)" }
        : {})}
      onSelect={
        hasMore && onOpenDetail
          ? () => onOpenDetail({ title, items: cards })
          : undefined
      }
    />
  );
}

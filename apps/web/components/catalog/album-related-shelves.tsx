"use client";

import { useCallback, useEffect, useMemo } from "react";
import MediaShelf, {
  type MediaShelfDisplayKind,
} from "@/components/media/media-shelf";
import { useAsyncResource } from "@/lib/api/use-async-resource";
import { getCatalogAlbumRelated } from "@/lib/catalog/catalog.api";
import {
  mapCatalogAlbums,
  mapCatalogPlaylists,
} from "@/lib/catalog/search.mapper";
import type { MediaCardProps } from "@/components/media/media-card.types";
import MediaShelfSkeleton from "@/components/loading/media-shelf-skeleton";
import { useMinimumLoadingDuration } from "@/lib/loading/use-minimum-loading-duration";

type AlbumRelatedShelvesProps = {
  albumId: string;
  availableSections?: {
    moreBy: boolean;
    featuredOn: boolean;
    youMightAlsoLike: boolean;
  };
  onAvailabilityChange?: (hasShelves: boolean) => void;
  onOpenDetail?: (shelf: {
    title: string;
    section: string;
  }) => void;
  onDetailLoaded?: (shelf: {
    section: string;
    items: MediaCardProps[];
    nextCursor: string;
  }) => void;
  onDetailLoadError?: (section: string) => void;
};

export function AlbumRelatedShelves({
  albumId,
  availableSections,
  onAvailabilityChange,
  onOpenDetail,
  onDetailLoaded,
  onDetailLoadError,
}: AlbumRelatedShelvesProps) {
  const loadRelated = useCallback(
    (signal?: AbortSignal) => getCatalogAlbumRelated(albumId, {}, signal),
    [albumId],
  );
  const { data, loading } = useAsyncResource(
    loadRelated,
    "Không thể tải các nội dung liên quan.",
  );
  const showRelatedLoading = useMinimumLoadingDuration(loading && !data);
  const loadingShelfCount = availableSections
    ? Number(availableSections.moreBy) +
      Number(availableSections.featuredOn) +
      Number(availableSections.youMightAlsoLike)
    : 3;
  const openShelfDetail = useCallback(
    async (section: string) => {
      if (!data) return;
      onOpenDetail?.({
        title: shelfTitle(section, data.primaryArtistName),
        section,
      });

      try {
        const response = await getCatalogAlbumRelated(albumId, {
          section,
          limit: 30,
        });
        const items =
          section === "featured-on"
            ? mapCatalogPlaylists(response.featuredOn)
            : mapCatalogAlbums(
                section === "more-by"
                  ? response.moreBy
                  : response.youMightAlsoLike,
              );
        onDetailLoaded?.({ section, items, nextCursor: response.nextCursor });
      } catch {
        onDetailLoadError?.(section);
      }
    },
    [albumId, data, onDetailLoadError, onDetailLoaded, onOpenDetail],
  );

  const shelves = useMemo(() => {
    if (!data) return [];

    return [
      {
        id: "more-by",
        title: data.primaryArtistName
          ? `More by ${data.primaryArtistName}`
          : "More by this artist",
        displayKind: "MusicCoverShelf" as MediaShelfDisplayKind,
        items: mapCatalogAlbums(data.moreBy),
        hasMore: data.moreByHasMore,
      },
      {
        id: "featured-on",
        title: "Featured On",
        displayKind: "MusicCoverShelf" as MediaShelfDisplayKind,
        items: mapCatalogPlaylists(data.featuredOn),
        hasMore: data.featuredOnHasMore,
      },
      {
        id: "you-might-also-like",
        title: "You Might Also Like",
        displayKind: "MusicCoverShelf" as MediaShelfDisplayKind,
        items: mapCatalogAlbums(data.youMightAlsoLike),
        hasMore: data.youMightAlsoLikeHasMore,
      },
    ].filter((shelf) => shelf.items.length > 0);
  }, [data]);

  useEffect(() => {
    onAvailabilityChange?.(shelves.length > 0);
  }, [onAvailabilityChange, shelves.length]);

  if (showRelatedLoading) {
    return Array.from({ length: loadingShelfCount }, (_, index) => (
      <MediaShelfSkeleton
        key={index}
        displayKind="MusicCoverShelf"
        containerClassName="bg-(--opaqueShelfBG)"
      />
    ));
  }

  return shelves.map((shelf) => (
    <MediaShelf
      key={shelf.id}
      shelfId={`album-${albumId}-${shelf.id}`}
      title={shelf.title}
      displayKind={shelf.displayKind}
      items={shelf.items}
      containerClassName="bg-(--opaqueShelfBG)"
      onSelect={
        shelf.hasMore ? () => void openShelfDetail(shelf.id) : undefined
      }
    />
  ));
}

function shelfTitle(section: string, primaryArtistName: string) {
  if (section === "more-by") {
    return primaryArtistName
      ? `More by ${primaryArtistName}`
      : "More by this artist";
  }
  return section === "featured-on" ? "Featured On" : "You might also like";
}

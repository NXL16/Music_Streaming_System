"use client";

import { useCallback, useEffect, useMemo } from "react";
import MediaShelf, {
  type MediaShelfDisplayKind,
} from "@/components/media/media-shelf";
import { useAsyncResource } from "@/lib/api/use-async-resource";
import { getCatalogAlbumRelated } from "@/lib/catalog/catalog.api";
import {
  catalogAlbumReleaseYearCardOptions,
  mapCatalogAlbums,
  mapCatalogPlaylists,
} from "@/lib/catalog/search.mapper";
import type { CatalogAlbumRelatedResponse } from "@/lib/catalog/catalog.types";
import type { MediaCardProps } from "@/components/media/media-card.types";
import MediaShelfSkeleton from "@/components/loading/media-shelf-skeleton";
import { useMinimumLoadingDuration } from "@/lib/loading/use-minimum-loading-duration";

type AlbumRelatedShelfSection =
  | "more-by"
  | "featured-on"
  | "you-might-also-like";

const ALL_RELATED_SHELF_SECTIONS: AlbumRelatedShelfSection[] = [
  "more-by",
  "featured-on",
  "you-might-also-like",
];

type AlbumRelatedShelvesProps = {
  albumId: string;
  sourceSongId?: string;
  moreByArtistName?: string;
  initialData?: CatalogAlbumRelatedResponse;
  sections?: readonly AlbumRelatedShelfSection[];
  availableSections?: {
    moreBy: boolean;
    featuredOn: boolean;
    youMightAlsoLike: boolean;
  };
  onAvailabilityChange?: (hasShelves: boolean) => void;
  onLoadingChange?: (isLoading: boolean) => void;
  onDataLoaded?: (data: CatalogAlbumRelatedResponse) => void;
  onOpenDetail?: (shelf: { title: string; section: string }) => void;
  onDetailLoaded?: (shelf: {
    section: string;
    items: MediaCardProps[];
    nextCursor: string;
  }) => void;
  onDetailLoadError?: (section: string) => void;
};

export function AlbumRelatedShelves({
  albumId,
  sourceSongId,
  moreByArtistName,
  initialData,
  sections: requestedSections,
  availableSections,
  onAvailabilityChange,
  onLoadingChange,
  onDataLoaded,
  onOpenDetail,
  onDetailLoaded,
  onDetailLoadError,
}: AlbumRelatedShelvesProps) {
  const loadRelated = useCallback(
    (signal?: AbortSignal) =>
      getCatalogAlbumRelated(albumId, { sourceSongId }, signal),
    [albumId, sourceSongId],
  );
  const { data, loading } = useAsyncResource(
    loadRelated,
    "Không thể tải các nội dung liên quan.",
    { initialData },
  );
  const showRelatedLoading = useMinimumLoadingDuration(loading && !data);
  const requestedShelfSections =
    requestedSections ?? ALL_RELATED_SHELF_SECTIONS;
  const loadingShelfCount = availableSections
    ? requestedShelfSections.reduce(
        (count, section) =>
          count +
          Number(
            section === "more-by"
              ? availableSections.moreBy
              : section === "featured-on"
                ? availableSections.featuredOn
                : availableSections.youMightAlsoLike,
          ),
        0,
      )
    : requestedShelfSections.length;
  const openShelfDetail = useCallback(
    async (section: string, title: string) => {
      if (!data) return;
      onOpenDetail?.({
        title,
        section,
      });

      try {
        const response = await getCatalogAlbumRelated(albumId, {
          section,
          limit: 30,
          sourceSongId,
        });
        const items =
          section === "featured-on"
            ? mapCatalogPlaylists(response.featuredOn)
            : mapCatalogAlbums(
                section === "more-by"
                  ? response.moreBy
                  : response.youMightAlsoLike,
                section === "more-by"
                  ? catalogAlbumReleaseYearCardOptions
                  : undefined,
              );
        onDetailLoaded?.({ section, items, nextCursor: response.nextCursor });
      } catch {
        onDetailLoadError?.(section);
      }
    },
    [
      albumId,
      data,
      onDetailLoadError,
      onDetailLoaded,
      onOpenDetail,
      sourceSongId,
    ],
  );

  const shelves = useMemo(() => {
    if (!data) return [];

    return [
      {
        id: "more-by" as const,
        title: moreByArtistName
          ? `More by ${moreByArtistName}`
          : data.primaryArtistName
            ? `More by ${data.primaryArtistName}`
            : "More by this artist",
        displayKind: "MusicCoverShelf" as MediaShelfDisplayKind,
        items: mapCatalogAlbums(
          data.moreBy,
          catalogAlbumReleaseYearCardOptions,
        ),
        hasMore: data.moreByHasMore,
      },
      {
        id: "featured-on" as const,
        title: "Featured On",
        displayKind: "MusicCoverShelf" as MediaShelfDisplayKind,
        items: mapCatalogPlaylists(data.featuredOn),
        hasMore: data.featuredOnHasMore,
      },
      {
        id: "you-might-also-like" as const,
        title: "You Might Also Like",
        displayKind: "MusicCoverShelf" as MediaShelfDisplayKind,
        items: mapCatalogAlbums(data.youMightAlsoLike),
        hasMore: data.youMightAlsoLikeHasMore,
      },
    ].filter(
      (shelf) =>
        shelf.items.length > 0 && requestedShelfSections.includes(shelf.id),
    );
  }, [data, moreByArtistName, requestedShelfSections]);

  useEffect(() => {
    onAvailabilityChange?.(shelves.length > 0);
  }, [onAvailabilityChange, shelves.length]);

  useEffect(() => {
    onLoadingChange?.(showRelatedLoading);
    return () => onLoadingChange?.(false);
  }, [onLoadingChange, showRelatedLoading]);

  useEffect(() => {
    if (data) onDataLoaded?.(data);
  }, [data, onDataLoaded]);

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
        shelf.hasMore
          ? () => void openShelfDetail(shelf.id, shelf.title)
          : undefined
      }
    />
  ));
}

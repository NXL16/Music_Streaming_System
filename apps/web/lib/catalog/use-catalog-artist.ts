"use client";

import { useCallback } from "react";
import { useCachedQuery } from "@/lib/api/use-cached-query";
import {
  artistDetailCacheKey,
  getCatalogArtistDetailData,
  getCatalogArtistAlbumSection,
  invalidateCatalogArtistDetailData,
  EMPTY_ALBUM_SECTIONS,
  type CatalogArtistDetailOptions,
  type ArtistAlbumSection,
} from "./artist-detail-data";

export function useCatalogArtist(
  artistId: string,
  {
    includeAlbums = true,
    includeSongs = true,
  }: CatalogArtistDetailOptions = {},
) {
  const load = useCallback(
    (signal: AbortSignal) =>
      getCatalogArtistDetailData(
        artistId,
        { includeAlbums, includeSongs },
        signal,
      ),
    [artistId, includeAlbums, includeSongs],
  );
  const {
    data,
    reload: reloadResource,
    ...state
  } = useCachedQuery(
    artistDetailCacheKey(artistId, { includeAlbums, includeSongs }),
    load,
    "Không thể tải nội dung thông tin nghệ sĩ.",
  );
  const reload = useCallback(() => {
    invalidateCatalogArtistDetailData(artistId);
    return reloadResource();
  }, [artistId, reloadResource]);
  const loadAlbumSection = useCallback(
    (section: ArtistAlbumSection) =>
      getCatalogArtistAlbumSection(artistId, section),
    [artistId],
  );
  return {
    artist: data?.artistDetail ?? null,
    albums: data?.albumList ?? [],
    albumSections: data?.albumSections ?? EMPTY_ALBUM_SECTIONS,
    songs: data?.songList ?? [],
    ...state,
    reload,
    loadAlbumSection,
  };
}

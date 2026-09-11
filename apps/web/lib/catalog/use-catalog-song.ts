"use client";

import { useCallback } from "react";
import { useAsyncResource } from "@/lib/api/use-async-resource";
import { getCatalogReleaseTrack } from "./catalog.api";
import { mapCatalogTracks } from "./catalog.mapper";

export function useCatalogSong(releaseTrackId: string) {
  const fetchSong = useCallback(
    async (signal?: AbortSignal) => {
      if (!releaseTrackId) return null;
      const catalog = await getCatalogReleaseTrack(releaseTrackId, signal);
      return (
        mapCatalogTracks(catalog).find(
          (song) => song.releaseTrackId === releaseTrackId,
        ) ?? null
      );
    },
    [releaseTrackId],
  );

  const { data: song, loading, error, reload } = useAsyncResource(
    fetchSong,
    "Không thể tải thông tin bài hát.",
  );

  return { song, loading, error, reload };
}

"use client";

import { useMemo } from "react";
import { useCatalogDetail } from "./use-catalog-detail";
import { mapCatalogTracks } from "./catalog.mapper";

export function useCatalogSong(releaseTrackId: string) {
  const { data, ...state } = useCatalogDetail(
    "release-tracks",
    releaseTrackId,
    "Không thể tải thông tin bài hát.",
  );
  const song = useMemo(
    () =>
      data
        ? (mapCatalogTracks(data).find(
            (track) => track.releaseTrackId === releaseTrackId,
          ) ?? null)
        : null,
    [data, releaseTrackId],
  );
  return { song, ...state };
}

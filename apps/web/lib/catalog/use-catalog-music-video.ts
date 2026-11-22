"use client";

import { useCallback } from "react";
import { useCachedQuery } from "@/lib/api/use-cached-query";
import { getCatalogMusicVideo } from "./music-videos.api";

export function useCatalogMusicVideo(songVideoId: string) {
  const fetchVideo = useCallback(
    (signal?: AbortSignal) => getCatalogMusicVideo(songVideoId, signal),
    [songVideoId],
  );

  return useCachedQuery(
    `catalog:catalog-music-videos:detail:${songVideoId}`,
    fetchVideo,
    "Không thể tải Music Video.",
    { enabled: Boolean(songVideoId) },
  );
}

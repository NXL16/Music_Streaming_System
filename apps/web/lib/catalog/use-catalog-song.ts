"use client";

import { useCallback } from "react";
import { useAsyncResource } from "@/lib/api/use-async-resource";
import { loadCatalogTracks } from "./load-catalog-tracks";

export function useCatalogSong(songId: string) {
  const fetchSong = useCallback(
    async (signal?: AbortSignal) => {
      const [catalogSong] = await loadCatalogTracks([songId], signal);
      return catalogSong ?? null;
    },
    [songId],
  );

  const { data: song, loading, error, reload } = useAsyncResource(
    fetchSong,
    "Không thể tải thông tin bài hát.",
  );

  return { song, loading, error, reload };
}

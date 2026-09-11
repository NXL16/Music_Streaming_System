"use client";

import { useCallback } from "react";
import { useAsyncResource } from "@/lib/api/use-async-resource";
import { getCatalogMusicVideo } from "./music-videos.api";

export function useCatalogMusicVideo(songVideoId: string) {
  const fetchVideo = useCallback(
    (signal?: AbortSignal) => getCatalogMusicVideo(songVideoId, signal),
    [songVideoId],
  );

  return useAsyncResource(fetchVideo, "Không tìm thấy music video.");
}

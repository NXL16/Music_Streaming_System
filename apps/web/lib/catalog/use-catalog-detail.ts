"use client";

import { useCallback } from "react";
import { useAsyncResource } from "@/lib/api/use-async-resource";
import { getCatalogAlbum, getCatalogPlaylist } from "./catalog.api";

export type CatalogDetailType = "albums" | "playlists";

export function useCatalogDetail(
  resourceType: CatalogDetailType,
  resourceId: string,
) {
  const fetchDetail = useCallback(
    (signal?: AbortSignal) =>
      resourceType === "albums"
        ? getCatalogAlbum(resourceId, signal)
        : getCatalogPlaylist(resourceId, signal),
    [resourceId, resourceType],
  );

  return useAsyncResource(fetchDetail, "Không thể tải nội dung catalog.");
}

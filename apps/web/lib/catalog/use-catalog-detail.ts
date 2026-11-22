"use client";

import { useCallback, useMemo } from "react";
import { useAsyncResource } from "@/lib/api/use-async-resource";
import { useAuthStore } from "@/lib/auth/auth-store";
import {
  getCatalogAlbum,
  getCatalogArtist,
  getCatalogReleaseTrack,
  getCatalogPlaylist,
  getCatalogDetailSnapshot,
  type CatalogDetailResourceType,
} from "./catalog.api";

export type CatalogDetailType = "albums" | "playlists";
const DETAIL_LOADERS = {
  albums: getCatalogAlbum,
  playlists: getCatalogPlaylist,
  artists: getCatalogArtist,
  "release-tracks": getCatalogReleaseTrack,
} satisfies Record<CatalogDetailResourceType, typeof getCatalogAlbum>;

export function useCatalogDetail(
  resourceType: CatalogDetailResourceType,
  resourceId: string,
  fallbackErrorMessage = "Không thể tải nội dung catalog.",
) {
  const userId = useAuthStore((state) => state.user?.userId);
  const initialData = useMemo(
    () => getCatalogDetailSnapshot(resourceType, resourceId, userId ?? null),
    [resourceType, resourceId, userId],
  );
  const fetchDetail = useCallback(
    (signal?: AbortSignal) => {
      if (useAuthStore.getState().user?.userId !== userId)
        throw new DOMException("Session changed", "AbortError");
      return DETAIL_LOADERS[resourceType](resourceId, signal);
    },
    [resourceId, resourceType, userId],
  );

  return useAsyncResource(fetchDetail, fallbackErrorMessage, {
    initialData,
    enabled: Boolean(resourceId),
  });
}

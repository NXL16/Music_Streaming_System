"use client";

import { useCallback, useState } from "react";
import type { CatalogAlbumRelatedResponse } from "./catalog.types";

/**
 * Keeps an album related-shelf preview alive while a full shelf view is open.
 * The snapshot is scoped to the current detail page, never shared globally.
 */
export function useAlbumRelatedShelfState(albumId: string, enabled = true) {
  const [availability, setAvailability] = useState({
    albumId: "",
    hasShelves: false,
  });
  const [loading, setLoading] = useState({
    albumId: "",
    isLoading: false,
  });
  const [cachedData, setCachedData] = useState<{
    albumId: string;
    data: CatalogAlbumRelatedResponse;
  } | null>(null);

  const onAvailabilityChange = useCallback(
    (hasShelves: boolean) => {
      setAvailability((current) =>
        current.albumId === albumId && current.hasShelves === hasShelves
          ? current
          : { albumId, hasShelves },
      );
    },
    [albumId],
  );
  const onLoadingChange = useCallback(
    (isLoading: boolean) => {
      setLoading((current) =>
        current.albumId === albumId && current.isLoading === isLoading
          ? current
          : { albumId, isLoading },
      );
    },
    [albumId],
  );
  const onDataLoaded = useCallback(
    (data: CatalogAlbumRelatedResponse) => {
      if (!albumId) return;
      setCachedData((current) =>
        current?.albumId === albumId && current.data === data
          ? current
          : { albumId, data },
      );
    },
    [albumId],
  );

  const hasShelves =
    enabled && availability.albumId === albumId && availability.hasShelves;
  const showSpacer =
    hasShelves ||
    (enabled && loading.albumId === albumId && loading.isLoading);

  return {
    initialData: cachedData?.albumId === albumId ? cachedData.data : undefined,
    showSpacer,
    onAvailabilityChange,
    onLoadingChange,
    onDataLoaded,
  };
}

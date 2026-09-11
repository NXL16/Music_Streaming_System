"use client";

import { useEffect, useMemo, useState } from "react";
import type { LibraryResourceType } from "./library-resources.api";
import {
  getLibraryResources,
  getLibraryResourcesSnapshot,
  hasLibraryResourceMembership,
} from "./library-resources.api";
import { useLibraryResourcesRevision } from "./use-library-resources-revision";

type Options = {
  resourceType: LibraryResourceType;
  resourceId: string;
  requiredSongIds?: string[];
  isLibraryAlbumView?: boolean;
};

/**
 * The single membership reader for Library controls. It subscribes to the
 * central revision and reads its synchronous snapshot, so pending deletions
 * update every surface before the Undo-window request reaches the server.
 */
export function useLibraryResourceMembership({
  resourceType,
  resourceId,
  requiredSongIds = [],
  isLibraryAlbumView = false,
}: Options) {
  const revision = useLibraryResourcesRevision();
  const resources = getLibraryResourcesSnapshot();
  const [loaded, setLoaded] = useState(Boolean(resources));

  useEffect(() => {
    let active = true;
    void getLibraryResources().finally(() => {
      if (active) setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [revision]);

  return useMemo(() => {
    if (!loaded || !resources) {
      return undefined;
    }
    return hasLibraryResourceMembership({
      resourceType,
      resourceId,
      songIds: requiredSongIds,
      isLibraryAlbumView,
    });
  }, [
    isLibraryAlbumView,
    loaded,
    requiredSongIds,
    resourceId,
    resourceType,
    resources,
  ]);
}

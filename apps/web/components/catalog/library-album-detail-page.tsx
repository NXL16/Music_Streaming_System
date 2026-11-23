"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useLibraryMediaCards } from "@/lib/library/use-library-media-cards";
import {
  getLibraryResources,
  isLibraryResourcePendingRemoval,
  type LibraryResource,
} from "@/lib/library/library-resources.api";
import { useLibraryResourcesRevision } from "@/lib/library/use-library-resources-revision";
import { libraryAlbumSongIds } from "@/lib/library/library-album-song-ids";
import CatalogPageLoading from "../loading/catalog-page-loading";
import { NotFoundState } from "../states/not-found-state";
import { RequestErrorState } from "../states/request-error-state";
import { CatalogDetailPage } from "./catalog-detail-page";

type LibraryAlbumDetailPageProps = {
  albumId: string;
  initialSelectedTrackId?: string;
};

/** Prevents a removed saved album from remaining reachable via a Library URL. */
export function LibraryAlbumDetailPage({
  albumId,
  initialSelectedTrackId,
}: LibraryAlbumDetailPageProps) {
  const userId = useAuthStore((state) => state.user?.userId);
  const revision = useLibraryResourcesRevision();
  const { resources, loading, error, retry } = useLibraryMediaCards({
    userId,
    errorMessage: "Could not load your saved albums.",
  });
  const [libraryResources, setLibraryResources] = useState<LibraryResource[]>(
    [],
  );
  const [loadingLibraryResources, setLoadingLibraryResources] = useState(true);
  const [libraryResourcesError, setLibraryResourcesError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void getLibraryResources()
      .then((nextResources) => {
        if (active) {
          setLibraryResources(nextResources);
          setLibraryResourcesError(false);
        }
      })
      .catch(() => {
        if (active) setLibraryResourcesError(true);
      })
      .finally(() => {
        if (active) setLoadingLibraryResources(false);
      });
    return () => {
      active = false;
    };
  }, [revision, retryKey, userId]);
  const isSaved = resources.some(
    (resource) =>
      resource.resourceType === "albums" &&
      resource.resourceId === albumId &&
      !isLibraryResourcePendingRemoval(
        resource.resourceType,
        resource.resourceId,
      ),
  );

  const librarySongIds = libraryAlbumSongIds(libraryResources, [albumId]);

  if (!userId) {
    return <NotFoundState />;
  }

  if (loading || loadingLibraryResources) return <CatalogPageLoading />;

  if (error || libraryResourcesError) {
    return (
      <RequestErrorState
        onRetry={() => {
          retry();
          setRetryKey((key) => key + 1);
        }}
      />
    );
  }

  if (!isSaved) {
    return <NotFoundState />;
  }

  return (
    <CatalogDetailPage
      resourceType="albums"
      resourceId={albumId}
      initialSelectedTrackId={initialSelectedTrackId}
      isLibraryView
      librarySongIds={librarySongIds}
    />
  );
}

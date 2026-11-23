"use client";

import { useCallback } from "react";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useAsyncResource } from "@/lib/api/use-async-resource";
import { getCatalogAlbum } from "@/lib/catalog/catalog.api";
import {
  getLibraryResources,
  getFreshLibraryResourcesSnapshot,
  getLibraryResourcesRevision,
  isLibraryResourcePendingRemoval,
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
  const initialData = userId ? getFreshLibraryResourcesSnapshot() : undefined;
  const load = useCallback(
    async () => {
      if (
        useAuthStore.getState().user?.userId !== userId ||
        getLibraryResourcesRevision() !== revision
      )
        throw new DOMException("Library context changed", "AbortError");
      const [resources] = await Promise.all([
        getLibraryResources(),
        getCatalogAlbum(albumId),
      ]);
      return resources;
    },
    [albumId, userId, revision],
  );
  const { data, loading, error, reload } = useAsyncResource(
    load,
    "Could not load your saved album.",
    { initialData, enabled: Boolean(userId) },
  );
  const resources = data ?? [];
  const isSaved = resources.some(
    (resource) =>
      resource.resourceType === "albums" &&
      resource.resourceId === albumId &&
      !isLibraryResourcePendingRemoval(
        resource.resourceType,
        resource.resourceId,
      ),
  );

  const librarySongIds = libraryAlbumSongIds(resources, [albumId]);

  if (!userId) {
    return <NotFoundState />;
  }

  if (loading && !data) return <CatalogPageLoading />;

  if (error) return <RequestErrorState onRetry={() => void reload()} />;

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

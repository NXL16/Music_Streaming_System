"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useLibraryMediaCards } from "@/lib/library/use-library-media-cards";
import {
  getLibraryResources,
  isLibraryResourcePendingRemoval,
  type LibraryResource,
} from "@/lib/library/library-resources.api";
import { useLibraryResourcesRevision } from "@/lib/library/use-library-resources-revision";
import CatalogPageLoading from "../loading/catalog-page-loading";
import { CatalogDetailPage } from "./catalog-detail-page";

type LibraryAlbumDetailPageProps = {
  albumId: string;
};

/** Prevents a removed saved album from remaining reachable via a Library URL. */
export function LibraryAlbumDetailPage({
  albumId,
}: LibraryAlbumDetailPageProps) {
  const userId = useAuthStore((state) => state.user?.userId);
  const revision = useLibraryResourcesRevision();
  const { resources, loading } = useLibraryMediaCards({
    userId,
    errorMessage: "Could not load your saved albums.",
  });
  const [libraryResources, setLibraryResources] = useState<LibraryResource[]>(
    [],
  );
  const [loadingLibraryResources, setLoadingLibraryResources] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void getLibraryResources()
      .then((nextResources) => {
        if (active) setLibraryResources(nextResources);
      })
      .finally(() => {
        if (active) setLoadingLibraryResources(false);
      });
    return () => {
      active = false;
    };
  }, [revision, userId]);
  const isSaved = useMemo(
    () =>
      resources.some(
        (resource) =>
          resource.resourceType === "albums" &&
          resource.resourceId === albumId &&
          !isLibraryResourcePendingRemoval(
            resource.resourceType,
            resource.resourceId,
          ),
      ),
    [albumId, resources],
  );

  const librarySongIds = useMemo(
    () =>
      libraryResources
        .filter(
          (resource) =>
            resource.resourceType === "songs" &&
            resource.sourceAlbumId === albumId,
        )
        .map((resource) => resource.resourceId),
    [albumId, libraryResources],
  );

  if (!userId) {
    return (
      <div className="[--buttonTextColor:var(--systemSecondary)] [--buttonBorderColor:var(--systemSecondary)] items-center text-(--systemSecondary) flex gap-3 flex-col left-[50%] m-auto max-w-110 p-[0_25px] absolute text-center top-[50%] transform-[translate(-50%,-50%)] z-(--z-default)">
        <h1 className="[font:var(--title-2)] mb-1.25">
          {`The page you're looking for can't be found.`}
        </h1>
      </div>
    );
  }

  if (loading || loadingLibraryResources) return <CatalogPageLoading />;

  if (!isSaved) {
    return (
      <div className="[--buttonTextColor:var(--systemSecondary)] [--buttonBorderColor:var(--systemSecondary)] items-center text-(--systemSecondary) flex gap-3 flex-col left-[50%] m-auto max-w-110 p-[0_25px] absolute text-center top-[50%] transform-[translate(-50%,-50%)] z-(--z-default)">
        <h1 className="[font:var(--title-2)] mb-1.25">
          {`The page you're looking for can't be found.`}
        </h1>
      </div>
    );
  }

  return (
    <CatalogDetailPage
      resourceType="albums"
      resourceId={albumId}
      isLibraryView
      librarySongIds={librarySongIds}
    />
  );
}

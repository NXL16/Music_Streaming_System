"use client";

import { useMemo } from "react";
import EmptyState from "@/components/layout/empty-state";
import HeaderWithSort from "@/components/layout/header-with-sort";
import CatalogPageLoading from "@/components/loading/catalog-page-loading";
import MediaCardRenderer from "@/components/media/media-card-renderer";
import { RequestErrorState } from "@/components/states/request-error-state";
import { useAuthStore } from "@/lib/auth/auth-store";
import { projectLibraryMediaCard } from "@/lib/library/library-media-card.mapper";
import { isLibraryResourcePendingRemoval } from "@/lib/library/library-resources.api";
import { useLibraryMediaCards } from "@/lib/library/use-library-media-cards";
import { useMinimumLoadingDuration } from "@/lib/loading/use-minimum-loading-duration";

export default function MadeForYouPage() {
  const userId = useAuthStore((state) => state.user?.userId);
  const { resources, loading, error, retry } = useLibraryMediaCards({
    userId,
    errorMessage: "Could not load your saved mixes.",
  });
  const visibleLoading = useMinimumLoadingDuration(loading);
  const cards = useMemo(
    () =>
      resources
        .filter(
          (resource) =>
            resource.resourceType === "playlists" &&
            resource.playlistType === "system-personalized" &&
            !isLibraryResourcePendingRemoval("playlists", resource.resourceId),
        )
        .sort(
          (left, right) =>
            new Date(right.createdAt ?? 0).getTime() -
            new Date(left.createdAt ?? 0).getTime(),
        )
        .map((resource) => projectLibraryMediaCard(resource)),
    [resources],
  );

  if (visibleLoading) return <CatalogPageLoading />;
  if (error) return <RequestErrorState onRetry={retry} />;
  if (!cards.length) return <EmptyState variant="made-for-you" />;

  return (
    <>
      <HeaderWithSort title="Made for You" showSort={false} />

      <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-5.5">
        <ul className="mb-8 mx-(--bodyGutter) ps-0 pe-0 grid gap-(--roomGridGap) grid-cols-[repeat(var(--roomGridColumns),minmax(0,1fr))] [--roomGridColumns:2] [--roomGridGap:10px] min-[415px]:[--roomGridColumns:3] min-[1000px]:[--roomGridGap:20px] min-[1000px]:[--roomGridColumns:4] min-[1260px]:[--roomGridColumns:5] min-[1580px]:[--roomGridColumns:6]">
          {cards.map((card) => (
            <MediaCardRenderer key={card.id} {...card} />
          ))}
        </ul>
      </div>
    </>
  );
}

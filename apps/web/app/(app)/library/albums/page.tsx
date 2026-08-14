"use client";

import { useMemo, useState } from "react";
import HeaderWithSort from "@/components/layout/header-with-sort";
import type {
  LibrarySortBy,
  SortDirection,
} from "@/components/custom-elements/m404-sort-menu-button";
import MediaCardRenderer from "@/components/media/media-card-renderer";
import { useAuthStore } from "@/lib/auth/auth-store";
import EmptyState from "@/components/layout/empty-state";
import CatalogPageLoading from "@/components/loading/catalog-page-loading";
import { isLibraryResourcePendingRemoval } from "@/lib/library/library-resources.api";
import { useMinimumLoadingDuration } from "@/lib/loading/use-minimum-loading-duration";
import { useLibraryMediaCards } from "@/lib/library/use-library-media-cards";
import {
  projectLibraryMediaCard,
} from "@/lib/library/library-media-card.mapper";

export default function AlbumsPage() {
  const user = useAuthStore((state) => state.user);
  const { resources, loading, error } = useLibraryMediaCards({
    userId: user?.userId,
    errorMessage: "Could not load your saved albums.",
  });
  const visibleLoading = useMinimumLoadingDuration(loading);
  const [sortBy, setSortBy] = useState<LibrarySortBy>("recently-added");
  const [sortDirection, setSortDirection] =
    useState<SortDirection>("descending");
  const albumCards = useMemo(
    () =>
      resources
        .filter(
          (resource) =>
            resource.resourceType === "albums" &&
            !isLibraryResourcePendingRemoval(
              resource.resourceType,
              resource.resourceId,
            ),
        )
        .map((resource) => ({
          card: projectLibraryMediaCard(resource),
          createdAt: resource.createdAt,
        }))
        .sort((left, right) => {
          const comparison =
            sortBy === "title"
              ? left.card.title.localeCompare(right.card.title)
              : new Date(left.createdAt ?? 0).getTime() -
                new Date(right.createdAt ?? 0).getTime();
          return sortDirection === "ascending" ? comparison : -comparison;
        }),
    [resources, sortBy, sortDirection],
  );

  if (visibleLoading) {
    return <CatalogPageLoading />;
  }

  if (error) {
    return (
      <div className="mx-(--bodyGutter) py-20 text-center text-(--keyColor)">
        {error}
      </div>
    );
  }

  if (!albumCards.length) {
    return <EmptyState />;
  }

  return (
    <>
      <HeaderWithSort
        title="Albums"
        sortBy={sortBy}
        direction={sortDirection}
        onSortByChange={setSortBy}
        onDirectionChange={setSortDirection}
      />

      <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-5.5">
        <ul className="mb-8 mx-(--bodyGutter) ps-0 pe-0 grid gap-(--roomGridGap) grid-cols-[repeat(var(--roomGridColumns),minmax(0,1fr))] [--roomGridColumns:2] [--roomGridGap:10px] min-[415px]:[--roomGridColumns:3] min-[1000px]:[--roomGridGap:20px] min-[1000px]:[--roomGridColumns:4] min-[1260px]:[--roomGridColumns:5] min-[1580px]:[--roomGridColumns:6]">
          {albumCards.map(({ card }) => (
            <MediaCardRenderer key={card.id} {...card} />
          ))}
        </ul>
      </div>
    </>
  );
}

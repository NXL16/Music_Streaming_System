"use client";

import { useMemo } from "react";
import HeaderWithSort from "@/components/layout/header-with-sort";
import MediaCardRenderer from "@/components/media/media-card-renderer";
import { useAuthStore } from "@/lib/auth/auth-store";
import EmptyState from "@/components/layout/empty-state";
import CatalogPageLoading from "@/components/loading/catalog-page-loading";
import Loading from "@/app/loading";
import { isLibraryResourcePendingRemoval } from "@/lib/library/library-resources.api";
import { useMinimumLoadingDuration } from "@/lib/loading/use-minimum-loading-duration";
import { useLibraryMediaCards } from "@/lib/library/use-library-media-cards";
import { useInfiniteScrollLoadMore } from "@/lib/pagination/use-infinite-scroll-sentinel";
import { useUserPlaylistPages } from "@/lib/playlists/use-user-playlist-pages";
import {
  projectLibraryMediaCard,
  projectUserPlaylistCard,
} from "@/lib/library/library-media-card.mapper";

export default function RecentlyAddedPage() {
  const user = useAuthStore((state) => state.user);
  const { resources, loading: isLoadingResources, error } = useLibraryMediaCards({
    userId: user?.userId,
    ensureFavorite: true,
    errorMessage: "Could not load recently added items.",
  });
  const {
    playlists,
    hasMore,
    isLoading: isLoadingPlaylists,
    isLoadingMore,
    loadMore,
  } = useUserPlaylistPages(user?.userId);
  const loading = useMinimumLoadingDuration(
    isLoadingResources || isLoadingPlaylists,
  );
  const { sentinelRef: loadMoreSentinelRef, showLoadingMore } = useInfiniteScrollLoadMore({
    enabled: hasMore,
    loading: isLoadingMore,
    onLoadMore: loadMore,
  });

  // Gộp toàn bộ (Albums + Public Playlists + Personal Playlists) và sắp xếp mới nhất
  const recentCards = useMemo(() => {
    const visiblePlaylists = playlists.filter(
      (playlist) => !isLibraryResourcePendingRemoval("playlists", playlist.id),
    );
    const visibleResources = resources.filter(
      (resource) =>
        !isLibraryResourcePendingRemoval(
          resource.resourceType,
          resource.resourceId,
        ),
    );
    const personalIds = new Set(visiblePlaylists.map((p) => p.id));

    // Lọc bỏ tài nguyên trùng với playlist cá nhân nếu có
    const savedResources = visibleResources.filter(
      (resource) =>
        (resource.resourceType === "albums" ||
          resource.resourceType === "playlists") &&
        !(
          resource.resourceType === "playlists" &&
          personalIds.has(resource.resourceId)
        ),
    );

    return [
      ...visiblePlaylists.map((playlist) => ({
        card: projectUserPlaylistCard(playlist),
        createdAt: playlist.createdAt,
      })),
      ...savedResources.map((resource) => ({
        card: projectLibraryMediaCard(resource),
        createdAt: resource.createdAt,
      })),
    ].sort(
      (left, right) =>
        new Date(right.createdAt ?? 0).getTime() -
        new Date(left.createdAt ?? 0).getTime(),
    );
  }, [playlists, resources]);

  return (
    <>
      {loading ? (
        <CatalogPageLoading />
      ) : !error && !recentCards.length ? (
        <EmptyState />
      ) : (
        <>
          <HeaderWithSort title="Recently Added" showSort={false} />

          <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-5.5">
            <ul className="mb-8 mx-(--bodyGutter) ps-0 pe-0 grid gap-(--roomGridGap) grid-cols-[repeat(var(--roomGridColumns),minmax(0,1fr))] [--roomGridColumns:2] [--roomGridGap:10px] min-[415px]:[--roomGridColumns:3] min-[1000px]:[--roomGridGap:20px] min-[1000px]:[--roomGridColumns:4] min-[1260px]:[--roomGridColumns:5] min-[1580px]:[--roomGridColumns:6]">
              {recentCards.map(({ card }) => (
                <MediaCardRenderer key={card.id} {...card} />
              ))}
            </ul>
            {showLoadingMore && <Loading fullScreen={false} size={26} />}
            {hasMore && (
              <div aria-hidden="true" ref={loadMoreSentinelRef} style={{ height: 1 }} />
            )}
          </div>
        </>
      )}
    </>
  );
}

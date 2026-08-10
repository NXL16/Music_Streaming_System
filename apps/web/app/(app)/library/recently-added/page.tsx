"use client";

import { useEffect, useMemo, useState } from "react";
import HeaderWithSort from "@/components/layout/header-with-sort";
import MediaCardRenderer from "@/components/media/media-card-renderer";
import { http } from "@/lib/api/http";
import { useAuthStore } from "@/lib/auth/auth-store";
import EmptyState from "@/components/layout/empty-state";
import CatalogPageLoading from "@/components/loading/catalog-page-loading";
import { subscribeLibraryResourcesChanged } from "@/lib/library/library-resources.api";
import { ensureFavoriteLibraryResource } from "@/lib/favorites/ensure-favorite-library-resource";
import { useMinimumLoadingState } from "@/lib/loading/use-minimum-loading-duration";
import {
  projectLibraryMediaCard,
  projectUserPlaylistCard,
  type LibraryMediaResource as LibraryResource,
  type UserPlaylistSummary as Playlist,
} from "@/lib/library/library-media-card.mapper";

export default function RecentlyAddedPage() {
  const user = useAuthStore((state) => state.user);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [resources, setResources] = useState<LibraryResource[]>([]);
  const [loading, setLoading] = useMinimumLoadingState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user?.userId) {
      queueMicrotask(() => setLoading(false));
      return;
    }
    let active = true;

    const loadLibrary = async () => {
      try {
        await ensureFavoriteLibraryResource();
        const [playlistResponse, resourceResponse] = await Promise.all([
          http.get(`/playlists/user/${encodeURIComponent(user.userId)}`, {
            params: { limit: 50 },
          }),
          http.get<{ resources: LibraryResource[] }>(
            "/songs/library/media-cards",
          ),
        ]);
        if (!active) return;

        setPlaylists(
          playlistResponse.data.playlists ??
            playlistResponse.data.data?.playlists ??
            [],
        );
        setResources(resourceResponse.data.resources ?? []);
        setError("");
      } catch {
        if (active) setError("Could not load recently added items.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadLibrary();
    const unsubscribe = subscribeLibraryResourcesChanged(() => {
      void loadLibrary();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [setLoading, user?.userId]);

  // Gộp toàn bộ (Albums + Public Playlists + Personal Playlists) và sắp xếp mới nhất
  const recentCards = useMemo(() => {
    const personalIds = new Set(playlists.map((p) => p.id));

    // Lọc bỏ tài nguyên trùng với playlist cá nhân nếu có
    const savedResources = resources.filter(
      (r) => !(r.resourceType === "playlists" && personalIds.has(r.resourceId)),
    );

    return [
      ...playlists.map((playlist) => ({
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
          <HeaderWithSort title="Recently Added" />

          <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-5.5">
            <ul className="mb-8 mx-(--bodyGutter) ps-0 pe-0 grid gap-(--roomGridGap) grid-cols-[repeat(var(--roomGridColumns),minmax(0,1fr))] [--roomGridColumns:2] [--roomGridGap:10px] min-[415px]:[--roomGridColumns:3] min-[1000px]:[--roomGridGap:20px] min-[1000px]:[--roomGridColumns:4] min-[1260px]:[--roomGridColumns:5] min-[1580px]:[--roomGridColumns:6]">
              {recentCards.map(({ card }) => (
                <MediaCardRenderer key={card.id} {...card} />
              ))}
            </ul>
          </div>
        </>
      )}
    </>
  );
}

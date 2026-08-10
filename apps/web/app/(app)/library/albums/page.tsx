"use client";

import { useEffect, useMemo, useState } from "react";
import HeaderWithSort from "@/components/layout/header-with-sort";
import MediaCardRenderer from "@/components/media/media-card-renderer";
import { http } from "@/lib/api/http";
import { useAuthStore } from "@/lib/auth/auth-store";
import EmptyState from "@/components/layout/empty-state";
import CatalogPageLoading from "@/components/loading/catalog-page-loading";
import { subscribeLibraryResourcesChanged } from "@/lib/library/library-resources.api";
import { useMinimumLoadingState } from "@/lib/loading/use-minimum-loading-duration";
import {
  projectLibraryMediaCard,
  type LibraryMediaResource as LibraryResource,
} from "@/lib/library/library-media-card.mapper";

export default function AlbumsPage() {
  const user = useAuthStore((state) => state.user);
  const [resources, setResources] = useState<LibraryResource[]>([]);
  const [loading, setLoading] = useMinimumLoadingState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user?.userId) {
      queueMicrotask(() => setLoading(false));
      return;
    }
    let active = true;

    const loadAlbums = async () => {
      try {
        const response = await http.get<{ resources: LibraryResource[] }>(
          "/songs/library/media-cards",
        );
        if (!active) return;
        setResources(response.data.resources ?? []);
        setError("");
      } catch {
        if (active) setError("Could not load your saved albums.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadAlbums();
    const unsubscribe = subscribeLibraryResourcesChanged(() => {
      void loadAlbums();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [setLoading, user?.userId]);

  const albumCards = useMemo(
    () =>
      resources
        .filter((resource) => resource.resourceType === "albums")
        .map((resource) => ({
          card: projectLibraryMediaCard(resource),
          createdAt: resource.createdAt,
        }))
        .sort(
          (left, right) =>
            new Date(right.createdAt ?? 0).getTime() -
            new Date(left.createdAt ?? 0).getTime(),
        ),
    [resources],
  );

  if (loading) {
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
      <HeaderWithSort title="Albums" />

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

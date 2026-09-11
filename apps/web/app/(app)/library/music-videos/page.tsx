"use client";

import { useEffect, useMemo, useState } from "react";
import EmptyState from "@/components/layout/empty-state";
import HeaderWithSort from "@/components/layout/header-with-sort";
import CatalogPageLoading from "@/components/loading/catalog-page-loading";
import MediaCardRenderer from "@/components/media/media-card-renderer";
import { ARTIST_MUSIC_VIDEO_GRID_STYLE } from "@/components/music-videos/catalog-music-videos-shelf";
import type {
  LibrarySortBy,
  SortDirection,
} from "@/components/custom-elements/m404-sort-menu-button";
import {
  getCatalogMusicVideo,
  type CatalogMusicVideo,
} from "@/lib/catalog/music-videos.api";
import { mapCatalogMusicVideoCards } from "@/lib/catalog/music-video-cards";
import { getLibraryResources } from "@/lib/library/library-resources.api";
import { useLibraryResourcesRevision } from "@/lib/library/use-library-resources-revision";
import { useMinimumLoadingDuration } from "@/lib/loading/use-minimum-loading-duration";

type LibraryMusicVideo = {
  video: CatalogMusicVideo;
  createdAt: number;
};

export default function MusicVideosPage() {
  const revision = useLibraryResourcesRevision();
  const [videos, setVideos] = useState<LibraryMusicVideo[]>();
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<LibrarySortBy>("recently-added");
  const [sortDirection, setSortDirection] =
    useState<SortDirection>("descending");
  const visibleLoading = useMinimumLoadingDuration(loading);

  useEffect(() => {
    let active = true;
    void getLibraryResources()
      .then(async (resources) => {
        const videoResources = resources
          .filter((resource) => resource.resourceType === "music-videos")
          .map((resource, index) => ({
            id: resource.resourceId,
            // The Library API returns newest first. Preserve this server order
            // as the stable recently-added key without duplicating metadata.
            createdAt: resources.length - index,
          }));
        const resolvedVideos = await Promise.all(
          videoResources.map(async ({ id, createdAt }) => {
            const video = await getCatalogMusicVideo(id).catch(() => null);
            return video ? { video, createdAt } : null;
          }),
        );
        return resolvedVideos.filter(
          (entry): entry is LibraryMusicVideo => entry !== null,
        );
      })
      .then((libraryVideos) => {
        if (!active) return;
        setVideos(libraryVideos);
      })
      .catch(() => {
        if (active) setVideos([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);

  const cards = useMemo(() => {
    const sort = [...(videos ?? [])].sort((left, right) => {
      const comparison =
        sortBy === "title"
          ? left.video.songTitle.localeCompare(right.video.songTitle)
          : left.createdAt - right.createdAt;
      return sortDirection === "ascending" ? comparison : -comparison;
    });
    return mapCatalogMusicVideoCards(sort.map(({ video }) => video), {
      artistShelf: false,
    });
  }, [sortBy, sortDirection, videos]);

  if (visibleLoading) {
    return <CatalogPageLoading />;
  }

  if (!cards.length) {
    return <EmptyState variant="music-videos" />;
  }

  return (
    <>
      <HeaderWithSort
        title="Music Videos"
        sortBy={sortBy}
        direction={sortDirection}
        onSortByChange={setSortBy}
        onDirectionChange={setSortDirection}
      />

      <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-5.5">
        <section
          className="box-border px-(--shelfGridPaddingInline,var(--bodyGutter)) relative w-full z-(--z-default) max-[999px]:ps-(--shelfGridPaddingInline,var(--bodyGutter)) max-[999px]:pe-0"
          style={ARTIST_MUSIC_VIDEO_GRID_STYLE}
        >
          <div className="box-content -mx-0.5 overflow-visible px-0.5 w-full">
            <ul className="shelf-grid__list mb-8">
              {cards.map((card) => (
                <MediaCardRenderer key={card.id} {...card} />
              ))}
            </ul>
          </div>
        </section>
      </div>
    </>
  );
}

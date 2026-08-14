import { useEffect, useState } from "react";
import { catalogArtworkSrcSet } from "@/lib/catalog/catalog.mapper";
import type { CatalogArtwork } from "@/lib/catalog/catalog.types";
import { THUMBNAIL_ARTWORK_WIDTHS } from "@/lib/media/artwork-slots";
import { getArtworkSrcSet } from "@/lib/media/artwork";
import { playlistArtworkVariants } from "@/lib/playlists/generated-playlist-cover";
import type { SongSummary } from "@/lib/songs/song.types";
import { listFavoriteSongs, listLibrarySongs } from "@/lib/songs/song.api";
import {
  getLibraryResources,
  getLibraryMediaCards,
  isLibraryResourcePendingRemoval,
  subscribeLibraryResourcesChanged,
  type LibraryResource,
} from "@/lib/library/library-resources.api";
import { useLibraryResourcesRevision } from "@/lib/library/use-library-resources-revision";

function getPinnedResources(resources: LibraryResource[]) {
  return resources
    .filter((resource) => resource.isPinned)
    .sort((a, b) => b.pinnedAt - a.pinnedAt);
}

type PinnedLibraryResource = LibraryResource & {
  artworkSrcSet?: string;
  catalogUrl?: string;
  contentRating?: string;
  playbackSong?: SongSummary;
};

export function usePinnedLibraryResources(userId?: string) {
  const [resources, setResources] = useState<PinnedLibraryResource[]>([]);
  useLibraryResourcesRevision();

  useEffect(() => {
    if (!userId) {
      return;
    }

    let active = true;
    let requestVersion = 0;
    const load = async () => {
      const currentRequestVersion = ++requestVersion;
      try {
        const libraryResources = await getLibraryResources();
        const pinnedResources = getPinnedResources(libraryResources);
        if (!pinnedResources.length) {
          if (active) setResources([]);
          return;
        }

        const pinnedSongIds = pinnedResources
          .filter((resource) => resource.resourceType === "songs")
          .map((resource) => resource.resourceId);
        const hasPinnedFavoriteCollection = pinnedResources.some(
          (resource) =>
            resource.resourceType === "playlists" &&
            resource.resourceId === "favorite",
        );
        const [mediaCards, librarySongs, favoriteResponse] = await Promise.all([
          getLibraryMediaCards(),
          listLibrarySongs({
            songIds: pinnedSongIds,
            limit: pinnedSongIds.length || 1,
          }),
          hasPinnedFavoriteCollection
            ? listFavoriteSongs({ limit: 1 })
            : Promise.resolve(undefined),
        ]);
        const favoriteArtwork = favoriteResponse?.collection?.artwork as
          | CatalogArtwork
          | undefined;
        const mediaByResource = new Map(
          mediaCards.map((resource) => [
            `${resource.resourceType}:${resource.resourceId}`,
            resource,
          ]),
        );
        const songById = new Map(
          (librarySongs.songs ?? []).map((song) => [song.id, song]),
        );
        const resourcesWithMetadata = pinnedResources.map((resource) => {
          const song =
            resource.resourceType === "songs"
              ? songById.get(resource.resourceId)
              : undefined;
          if (song) {
            return {
              ...resource,
              title: song.title,
              subtitle: song.artist,
              artworkUrl: song.coverUrl || resource.artworkUrl,
              artworkSrcSet:
                song.thumbnailCoverSrcSet ??
                song.coverUrl ??
                resource.artworkUrl,
              contentRating: song.contentRating,
              playbackSong: song,
            };
          }
          const media = mediaByResource.get(
            `${resource.resourceType}:${resource.resourceId}`,
          );
          const isFavoriteCollection =
            resource.resourceType === "playlists" &&
            resource.resourceId === "favorite";
          const artworkUrl = media?.artworkUrl || resource.artworkUrl || "";
          const generatedArtwork = playlistArtworkVariants(artworkUrl);
          return {
            ...resource,
            ...media,
            artworkSrcSet:
              isFavoriteCollection && favoriteArtwork
                ? catalogArtworkSrcSet(favoriteArtwork, [
                    ...THUMBNAIL_ARTWORK_WIDTHS,
                  ])
                : media?.artwork
                  ? catalogArtworkSrcSet(media.artwork, [
                      ...THUMBNAIL_ARTWORK_WIDTHS,
                    ])
                  : generatedArtwork
                    ? getArtworkSrcSet(
                        { url: artworkUrl, variants: generatedArtwork },
                        [...THUMBNAIL_ARTWORK_WIDTHS],
                      )
                    : artworkUrl,
          };
        });

        if (active && currentRequestVersion === requestVersion) {
          setResources(resourcesWithMetadata);
        }
      } catch {
        // A library mutation can invalidate in-flight work. Ignore stale
        // failures so an aborted request cannot erase freshly loaded pins.
        if (active && currentRequestVersion === requestVersion) {
          setResources([]);
        }
      }
    };

    void load();
    const unsubscribe = subscribeLibraryResourcesChanged(() => void load());
    return () => {
      active = false;
      requestVersion += 1;
      unsubscribe();
    };
  }, [userId]);

  return userId
    ? resources.filter(
        (resource) =>
          !isLibraryResourcePendingRemoval(
            resource.resourceType,
            resource.resourceId,
          ),
      )
    : [];
}

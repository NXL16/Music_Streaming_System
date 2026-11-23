import { librarySongKey } from "@/lib/library/library-song-key";
import { useEffect, useState } from "react";
import { catalogArtworkSrcSet } from "@/lib/catalog/catalog.mapper";
import type { CatalogArtwork } from "@/lib/catalog/catalog.types";
import { THUMBNAIL_ARTWORK_WIDTHS } from "@/lib/media/artwork-slots";
import { getArtworkSrcSet } from "@/lib/media/artwork";
import { playlistArtworkVariants } from "@/lib/playlists/generated-playlist-cover";
import type { SongSummary } from "@/lib/songs/song.types";
import { listFavoriteSongs, getAllLibrarySongs } from "@/lib/songs/song.api";
import {
  getLibraryResources,
  getLibraryMediaCards,
  isLibraryResourcePendingRemoval,
  type LibraryResource,
} from "@/lib/library/library-resources.api";
import { useLibraryResourcesRevision } from "@/lib/library/use-library-resources-revision";
import { libraryAlbumSongIds } from "@/lib/library/library-album-song-ids";

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
  canShuffle?: boolean;
};

export function usePinnedLibraryResources(userId?: string) {
  const [snapshot, setSnapshot] = useState<{
    userId?: string;
    resources: PinnedLibraryResource[];
  }>({ resources: [] });
  const revision = useLibraryResourcesRevision();

  useEffect(() => {
    if (!userId) {
      return;
    }

    let active = true;
    const load = async () => {
      try {
        const libraryResources = await getLibraryResources();
        const pinnedResources = getPinnedResources(libraryResources);
        if (!pinnedResources.length) {
          if (active) setSnapshot({ userId, resources: [] });
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
          pinnedSongIds.length
            ? getAllLibrarySongs({ songIds: pinnedSongIds })
            : Promise.resolve([]),
          hasPinnedFavoriteCollection
            ? listFavoriteSongs({ limit: 2 })
            : Promise.resolve(undefined),
        ]);
        const favoriteArtwork = favoriteResponse?.collection?.artwork as
          CatalogArtwork | undefined;
        const mediaByResource = new Map(
          mediaCards.map((resource) => [
            `${resource.resourceType}:${resource.resourceId}`,
            resource,
          ]),
        );
        const songById = new Map(
          librarySongs.map((song) => [
            librarySongKey(song.id, song.albumId),
            song,
          ]),
        );
        const resourcesWithMetadata = pinnedResources.map((resource) => {
          const song =
            resource.resourceType === "songs"
              ? songById.get(
                  librarySongKey(resource.resourceId, resource.sourceAlbumId),
                )
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
            canShuffle:
              resource.resourceType === "albums"
                ? libraryAlbumSongIds(libraryResources, [resource.resourceId])
                    .length > 1
                : isFavoriteCollection
                  ? (favoriteResponse?.songs.length ?? 0) > 1
                  : (media?.trackCount ?? media?.songIds?.length ?? 0) > 1,
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

        if (active) {
          setSnapshot({ userId, resources: resourcesWithMetadata });
        }
      } catch {
        if (active) {
          setSnapshot({ userId, resources: [] });
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [revision, userId]);

  return userId && snapshot.userId === userId
    ? snapshot.resources.filter(
        (resource) =>
          !isLibraryResourcePendingRemoval(
            resource.resourceType,
            resource.resourceId,
            resource.sourceAlbumId,
          ),
      )
    : [];
}

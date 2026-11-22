import { librarySongKey } from "@/lib/library/library-song-key";
import {
  getLibraryResources,
  getLibraryResourcesSnapshot,
  hasLibraryResourceMembership,
  isLibraryResource,
  isLibraryResourcePinned,
} from "@/lib/library/library-resources.api";
import { getAlbumFavorite } from "@/lib/favorites/album-favorite.api";
import { useAlbumFavoriteStore } from "@/lib/favorites/use-album-favorite-store";
import { usePlaylistFavoriteStore } from "@/lib/favorites/use-playlist-favorite-store";
import { useFavoriteStore } from "@/lib/favorites/use-favorite-store";
import {
  getCatalogReleaseTrack,
  getCatalogResources,
} from "@/lib/catalog/catalog.api";
import { mapCatalogTracks } from "@/lib/catalog/catalog.mapper";
import {
  hydrateSuggestLess,
  isSuggestLessActive,
} from "@/lib/recommendations/suggest-less.api";
import type { ContextMenuContext } from "./types";

export async function resolveContextMenuContext(
  context: ContextMenuContext | undefined,
) {
  let menuContext = context;

  if (
    context?.kind === "collection" ||
    context?.kind === "song" ||
    context?.kind === "video"
  ) {
    // Suggest Less is an independent preference projection. A temporary
    // failure there must never prevent the Library membership calculation
    // that controls Add/Delete in this menu.
    await hydrateSuggestLess().catch(() => undefined);
    try {
      // A mutation can already have applied an optimistic Library snapshot.
      // Reuse it so an open menu updates immediately rather than waiting for
      // the background revalidation request to finish.
      if (!getLibraryResourcesSnapshot()) {
        await getLibraryResources();
      }
      let albumSongIds =
        context.kind === "collection" ? context.songIds : undefined;
      // Shelf/search cards intentionally contain lightweight catalog data.
      // Their parent Album row can exist after saving only one song, so it
      // cannot decide whether the whole album is in Library. Resolve the
      // canonical release tracklist only when the caller did not provide it.
      if (
        context.kind === "collection" &&
        context.resourceType === "albums" &&
        context.sourceOrigin === "catalog" &&
        !albumSongIds?.length &&
        !context.isLibraryView
      ) {
        try {
          const album = await getCatalogResources([
            { id: context.resourceId, type: "albums" },
          ]);
          albumSongIds = mapCatalogTracks(album, {
            albumId: context.resourceId,
          }).map((track) => track.id);
        } catch {
          // A failed optional catalog lookup must not discard the Library
          // snapshot already available to this menu.
        }
      }
      menuContext =
        context.kind === "collection"
          ? {
              ...context,
              songIds: albumSongIds,
              trackSources:
                context.resourceType === "albums"
                  ? albumSongIds?.map((songId) => ({
                      songId,
                      sourceAlbumId: context.resourceId,
                    }))
                  : context.trackSources,
              inLibrary: hasLibraryResourceMembership({
                resourceType: context.resourceType,
                resourceId: context.resourceId,
                songIds: albumSongIds,
                isLibraryAlbumView: context.isLibraryView,
              }),
              isPinned: isLibraryResourcePinned(
                context.resourceType,
                context.resourceId,
              ),
            }
          : {
              ...context,
              inLibrary: isLibraryResource(
                "songs",
                context.songId,
                context.sourceAlbumId,
              ),
              isPinned: isLibraryResourcePinned(
                "songs",
                context.songId,
                context.sourceAlbumId,
              ),
            };
    } catch {
      // The menu remains usable when membership lookup is temporarily unavailable.
    }
  }

  // Music Video cards carry a release-track identity rather than an Album
  // id. Resolve it before building Song-derived actions so Favourite, Add
  // to Library, and Add to Playlist use the same release context as a Song
  // row. This also covers the short interval before a video playback's
  // canonical Song metadata finishes loading into the player bar.
  if (
    menuContext?.kind === "video" &&
    !menuContext.sourceAlbumId &&
    menuContext.releaseTrackId
  ) {
    const videoContext = menuContext;
    const releaseTrackId = videoContext.releaseTrackId;
    if (releaseTrackId) {
      try {
        const release = await getCatalogReleaseTrack(releaseTrackId);
        const song = mapCatalogTracks(release).find(
          (track) => track.id === videoContext.songId,
        );
        if (song?.albumId) {
          menuContext = {
            ...videoContext,
            sourceAlbumId: song.albumId,
            albumHref: song.albumUrl,
          };
        }
      } catch {
        // Queue and sharing actions remain useful if the optional release
        // lookup is temporarily unavailable.
      }
    }
  }

  if (
    menuContext?.kind === "collection" &&
    menuContext.resourceType === "albums"
  ) {
    try {
      const favoriteState = useAlbumFavoriteStore.getState();
      const isFavorite =
        favoriteState.loaded ||
        favoriteState.resolvedAlbumIds.has(menuContext.resourceId)
          ? favoriteState.albumIds.has(menuContext.resourceId)
          : await getAlbumFavorite(menuContext.resourceId);
      menuContext = {
        ...menuContext,
        isFavorite,
        isSuggestLess: isSuggestLessActive("albums", menuContext.resourceId),
        // Album membership remains based on the complete tracklist. A
        // parent Album row created by one saved track must not show Delete.
        inLibrary: menuContext.inLibrary,
      };
    } catch {
      // The rest of the album menu stays available if the favourite state cannot load.
    }
  }

  if (
    menuContext?.kind === "collection" &&
    menuContext.resourceType === "playlists"
  ) {
    try {
      const favoriteState = usePlaylistFavoriteStore.getState();
      if (
        !favoriteState.loaded &&
        !favoriteState.resolvedPlaylistIds.has(menuContext.resourceId)
      ) {
        await favoriteState.hydrate();
      }
      menuContext = {
        ...menuContext,
        isFavorite: usePlaylistFavoriteStore
          .getState()
          .playlistIds.has(menuContext.resourceId),
        isSuggestLess: isSuggestLessActive("playlists", menuContext.resourceId),
      };
    } catch {
      // Keep the remaining playlist menu actions available on a transient failure.
    }
  }

  if (menuContext?.kind === "song" || menuContext?.kind === "video") {
    try {
      const favoriteState = useFavoriteStore.getState();
      await favoriteState.hydrate();
      menuContext = {
        ...menuContext,
        isFavorite: useFavoriteStore
          .getState()
          .songKeys.has(
            librarySongKey(menuContext.songId, menuContext.sourceAlbumId),
          ),
        isSuggestLess: isSuggestLessActive("songs", menuContext.songId),
      };
    } catch {
      // The song menu remains available if favourite state cannot load.
    }
  }

  return menuContext;
}

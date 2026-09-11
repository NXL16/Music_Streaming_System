import { getCatalogPlaylistTracks } from "@/lib/catalog/catalog.api";
import type { ContextMenuContext } from "@/lib/context-menu/types";
import { useFavoriteStore } from "@/lib/favorites/use-favorite-store";
import { getLibraryResources } from "@/lib/library/library-resources.api";
import { toTrackSources } from "@/lib/songs/track-sources";

/**
 * Resolves a public playlist card into immutable track IDs before it crosses
 * the API boundary. User playlists already belong to the private service and
 * album sources are resolved by their catalog resolver on the API.
 */
export async function resolvePlaylistSource(
  source: ContextMenuContext,
): Promise<ContextMenuContext> {
  if (
    source.kind === "collection" &&
    source.resourceType === "albums" &&
    source.isLibraryView
  ) {
    // A Library Album can represent only a selection from a public release.
    // Never copy hidden catalog tracks into another playlist.
    const savedSongIds = new Set(
      (await getLibraryResources())
        .filter(
          (resource) =>
            resource.resourceType === "songs" &&
            resource.sourceAlbumId === source.resourceId,
        )
        .map((resource) => resource.resourceId),
    );
    const trackSourcesBySongId = new Map(
      source.trackSources?.map((track) => [track.songId, track]) ?? [],
    );
    const songIds = (source.songIds ?? []).filter((songId) =>
      savedSongIds.has(songId),
    );

    return {
      ...source,
      songIds,
      trackSources: songIds.map(
        (songId) =>
          trackSourcesBySongId.get(songId) ?? {
            songId,
            sourceAlbumId: source.resourceId,
          },
      ),
    };
  }

  if (
    source.kind === "collection" &&
    source.resourceType === "playlists" &&
    source.sourceOrigin === "favorite"
  ) {
    await useFavoriteStore.getState().hydrate();
    return {
      ...source,
      songIds: useFavoriteStore.getState().songs.map((song) => song.id),
      trackSources: toTrackSources(useFavoriteStore.getState().songs),
    };
  }

  if (
    source.kind !== "collection" ||
    source.resourceType !== "playlists" ||
    source.sourceOrigin !== "catalog" ||
    source.songIds?.length
  ) {
    return source;
  }

  const playlist = await getCatalogPlaylistTracks(source.resourceId);
  const tracks = playlist.data.flatMap((item) => {
    if (item.type !== "songs") return [];
    const song = playlist.resources.songs[item.id];
    const albumId = song?.relationships.albums?.data[0]?.id;
    return albumId ? [{ songId: item.id, sourceAlbumId: albumId }] : [];
  });

  return { ...source, songIds: tracks.map((track) => track.songId), trackSources: tracks };
}

import { getCatalogPlaylistTracks } from "@/lib/catalog/catalog.api";
import type { ContextMenuContext } from "@/lib/context-menu/types";
import { useFavoriteStore } from "@/lib/favorites/use-favorite-store";

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
    source.resourceType === "playlists" &&
    source.sourceOrigin === "favorite"
  ) {
    await useFavoriteStore.getState().hydrate();
    return {
      ...source,
      songIds: useFavoriteStore.getState().songs.map((song) => song.id),
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
  const songIds = playlist.data
    .filter((item) => item.type === "songs")
    .map((item) => item.id);

  return { ...source, songIds };
}

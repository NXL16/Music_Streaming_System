import { getCatalogArtistSongs } from "./catalog.api";
import { mapCatalogTracks } from "./catalog.mapper";
import {
  getCachedQuery,
  getCachedQuerySnapshot,
  invalidateCachedQueries,
} from "@/lib/api/query-cache";
import type { PlayerSong } from "@/lib/player/use-player-store";

type ArtistSongPage = {
  songs: PlayerSong[];
  nextCursor?: string;
  hasMore: boolean;
};

export function artistSongCachePrefix(artistId: string) {
  return "catalog:artist-song-page:" + encodeURIComponent(artistId) + ":";
}
function pageKey(artistId: string, cursor?: string) {
  return artistSongCachePrefix(artistId) + JSON.stringify(cursor ?? null);
}
export function getCatalogArtistSongPageSnapshot(
  artistId: string,
  cursor?: string,
) {
  return getCachedQuerySnapshot<ArtistSongPage>(pageKey(artistId, cursor));
}
export function getCatalogArtistSongPage(
  artistId: string,
  { cursor }: { cursor?: string } = {},
) {
  const key = pageKey(artistId, cursor);
  return getCachedQuery(key, async (signal): Promise<ArtistSongPage> => {
    const response = await getCatalogArtistSongs(artistId, { cursor, signal });
    return {
      songs: mapCatalogTracks(response),
      nextCursor: response.nextCursor,
      hasMore: Boolean(response.nextCursor),
    };
  });
}

export async function getAllCatalogArtistSongs(artistId: string) {
  const songsById = new Map<string, PlayerSong>();
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  do {
    const page = await getCatalogArtistSongPage(artistId, { cursor });
    for (const song of page.songs) songsById.set(song.id, song);

    cursor = page.nextCursor;
    if (cursor && seenCursors.has(cursor)) {
      throw new Error("Artist song pagination returned a repeated cursor.");
    }
    if (cursor) seenCursors.add(cursor);
  } while (cursor);

  return [...songsById.values()];
}

export function invalidateCatalogArtistSongPages(artistId: string) {
  invalidateCachedQueries(artistSongCachePrefix(artistId));
}

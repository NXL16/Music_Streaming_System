import { getCatalogArtistSongs } from "./catalog.api";
import { mapCatalogTracks } from "./catalog.mapper";
import { developmentCacheDisabled } from "@/lib/config/development-cache";
import type { PlayerSong } from "@/lib/player/use-player-store";

export const ARTIST_SONGS_PAGE_SIZE = 20;

type ArtistSongPage = {
  songs: PlayerSong[];
  nextCursor?: string;
};

type CacheEntry = {
  expiresAt: number;
  value: ArtistSongPage;
};

const CACHE_TTL_MS = 2 * 60 * 1000;
const MAX_CACHE_ENTRIES = 48;
const pageCache = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<ArtistSongPage>>();

function pageKey(artistId: string, cursor?: string) {
  return `${artistId}:${cursor ?? "first"}`;
}

function readCache(key: string) {
  if (developmentCacheDisabled) return undefined;
  const cached = pageCache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) {
    if (cached) pageCache.delete(key);
    return undefined;
  }

  pageCache.delete(key);
  pageCache.set(key, cached);
  return cached.value;
}

function writeCache(key: string, value: ArtistSongPage) {
  if (developmentCacheDisabled) return;
  pageCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });

  while (pageCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = pageCache.keys().next().value;
    if (!oldestKey) break;
    pageCache.delete(oldestKey);
  }
}

export function getCatalogArtistSongPage(
  artistId: string,
  { cursor, force = false }: { cursor?: string; force?: boolean } = {},
) {
  const key = pageKey(artistId, cursor);
  if (force) pageCache.delete(key);

  const cached = readCache(key);
  if (cached) return Promise.resolve(cached);

  const pending = pendingRequests.get(key);
  if (pending) return pending;

  const request = getCatalogArtistSongs(artistId, { cursor })
    .then((response) => ({
      songs: mapCatalogTracks(response),
      nextCursor: response.nextCursor,
    }))
    .then((page) => {
      writeCache(key, page);
      return page;
    })
    .finally(() => {
      pendingRequests.delete(key);
    });

  pendingRequests.set(key, request);
  return request;
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
  for (const key of pageCache.keys()) {
    if (key.startsWith(`${artistId}:`)) pageCache.delete(key);
  }
}

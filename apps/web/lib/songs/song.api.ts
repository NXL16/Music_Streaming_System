import { http } from "@/lib/api/http";
import { getCachedQuery } from "@/lib/api/query-cache";
import type {
  DeleteSongResponse,
  GetSongResponse,
  ListFavoriteSongsResponse,
  ListSongsResponse,
  RequestUploadPayload,
  RequestUploadResponse,
  SongSummary,
} from "./song.types";

const FAVORITES_KEY = "songs:favorites";
const FAVORITES_TTL_MS = 60_000;
let favoritesCacheVersion = 0;

function favoriteCacheKey(params?: { cursor?: string; limit?: number }) {
  return [
    FAVORITES_KEY,
    favoritesCacheVersion,
    params?.cursor ?? "first",
    params?.limit ?? 50,
  ].join(":");
}

function invalidateFavoriteSongsCache() {
  favoritesCacheVersion += 1;
}

export async function listPublicSongs(params?: {
  cursor?: string;
  limit?: number;
}) {
  const response = await http.get<ListSongsResponse>("/songs", {
    params: {
      cursor: params?.cursor,
      limit: params?.limit ?? 20,
    },
  });

  return response.data;
}

export async function listMySongs(params?: {
  cursor?: string;
  limit?: number;
  search?: string;
  artist?: string;
}) {
  const response = await http.get<ListSongsResponse>("/songs/me", {
    params: {
      cursor: params?.cursor,
      limit: params?.limit ?? 20,
      search: params?.search,
      artist: params?.artist,
    },
  });

  return response.data;
}

export async function listLibrarySongs(params?: {
  cursor?: string;
  limit?: number;
  sortBy?: "title" | "recently-added";
  direction?: "ascending" | "descending";
  songIds?: string[];
}) {
  const response = await http.get<ListSongsResponse>("/songs/library/songs", {
    params: {
      cursor: params?.cursor,
      limit: params?.limit ?? 40,
      sortBy: params?.sortBy ?? "recently-added",
      direction: params?.direction ?? "descending",
      songIds: params?.songIds?.join(","),
    },
  });
  return response.data;
}

/** Loads every cursor page when playback needs the complete Library queue. */
export async function getAllLibrarySongs(params?: {
  sortBy?: "title" | "recently-added";
  direction?: "ascending" | "descending";
  songIds?: string[];
}) {
  const songs: SongSummary[] = [];
  const songIds = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | undefined;

  while (true) {
    const page = await listLibrarySongs({ ...params, cursor, limit: 100 });
    for (const song of page.songs ?? []) {
      if (songIds.has(song.id)) continue;
      songIds.add(song.id);
      songs.push(song);
    }
    if (!page.hasMore) return songs;
    if (!page.nextCursor || cursors.has(page.nextCursor)) {
      throw new Error("INVALID_LIBRARY_SONG_CURSOR");
    }
    cursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
}

export async function listFavoriteSongs(
  params?: {
    cursor?: string;
    limit?: number;
  },
  options?: { force?: boolean },
) {
  if (options?.force) invalidateFavoriteSongsCache();

  return getCachedQuery(
    favoriteCacheKey(params),
    async (signal) =>
      (
        await http.get<ListFavoriteSongsResponse>("/songs/favorites", {
          signal,
          params: {
            cursor: params?.cursor,
            limit: params?.limit ?? 50,
          },
        })
      ).data,
    FAVORITES_TTL_MS,
  );
}

export async function addFavoriteSong(songId: string) {
  const response = await http.post<{ success: boolean }>(
    `/songs/${encodeURIComponent(songId)}/favorite`,
  );
  invalidateFavoriteSongsCache();
  return response.data;
}

export async function removeFavoriteSong(songId: string) {
  const response = await http.delete<{ success: boolean }>(
    `/songs/${encodeURIComponent(songId)}/favorite`,
  );
  invalidateFavoriteSongsCache();
  return response.data;
}

export async function getMySong(songId: string) {
  const response = await http.get<GetSongResponse>(`/songs/private/${songId}`);

  return response.data;
}

export async function getSongStreamUrl(songId: string) {
  const response = await http.get<{
    streamUrl: string;
    key: string;
    iv: string;
  }>(`/stream/${encodeURIComponent(songId)}`);

  return response.data;
}

export async function requestSongUpload(payload: RequestUploadPayload) {
  const response = await http.post<RequestUploadResponse>(
    "/songs/request-upload",
    payload,
  );

  return response.data;
}

export async function uploadSongFile(
  uploadUrl: string,
  file: File,
  signal?: AbortSignal,
) {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/octet-stream",
    },
    body: file,
    signal,
  });

  if (!response.ok) {
    throw new Error(`UPLOAD_FILE_FAILED status=${response.status}`);
  }
}

export async function deleteMySong(songId: string) {
  const response = await http.delete<DeleteSongResponse>(`/songs/${songId}`);

  return response.data;
}

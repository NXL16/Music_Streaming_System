import { getCachedQuery, invalidateCachedQuery } from "@/lib/api/query-cache";
import { http } from "@/lib/api/http";
import type { ContextMenuContext } from "@/lib/context-menu/types";
import {
  isLibraryResourcePendingRemoval,
  refreshLibraryResources,
} from "@/lib/library/library-resources.api";
import type { SongSummary } from "@/lib/songs/song.types";
import { notifyPlaylistChanged } from "./playlist-events";

export type UserPlaylistSummary = {
  id: string;
  name: string;
  description?: string;
  trackCount?: number;
  createdAt?: number;
  updatedAt?: number;
  artworkUrl?: string;
};

export type UserPlaylistDetail = UserPlaylistSummary & {
  ownerId?: string;
};

export type UserPlaylistPage = {
  playlists: UserPlaylistSummary[];
  nextCursor: string;
  hasMore: boolean;
};

export type UserPlaylistTrackPage = {
  songs: SongSummary[];
  nextCursor: string;
  hasMore: boolean;
};

const CACHE_TTL_MS = 60_000;

function cacheKey(userId: string) {
  return `user-playlists:${userId}`;
}

export async function listUserPlaylists(
  userId: string,
  params?: { cursor?: string; limit?: number },
): Promise<UserPlaylistPage> {
  const response = await http.get<UserPlaylistPage>(
    `/playlists/user/${encodeURIComponent(userId)}`,
    { params: { cursor: params?.cursor, limit: params?.limit ?? 24 } },
  );
  return {
    playlists: response.data.playlists ?? [],
    nextCursor: response.data.nextCursor ?? "",
    hasMore: response.data.hasMore ?? false,
  };
}

/** Loads all pages only in controls that must expose every owned playlist. */
export function getUserPlaylists(userId: string) {
  return getCachedQuery(
    cacheKey(userId),
    async (signal) => {
      const playlists: UserPlaylistSummary[] = [];
      const playlistIds = new Set<string>();
      const cursors = new Set<string>();
      let cursor: string | undefined;

      while (true) {
        const response = await http.get<UserPlaylistPage>(
          `/playlists/user/${encodeURIComponent(userId)}`,
          { params: { cursor, limit: 50 }, signal },
        );
        const page = {
          playlists: response.data.playlists ?? [],
          nextCursor: response.data.nextCursor ?? "",
          hasMore: response.data.hasMore ?? false,
        };
        for (const playlist of page.playlists) {
          if (playlistIds.has(playlist.id)) continue;
          playlistIds.add(playlist.id);
          playlists.push(playlist);
        }
        if (!page.hasMore) return playlists;
        if (!page.nextCursor || cursors.has(page.nextCursor)) {
          throw new Error("INVALID_USER_PLAYLIST_CURSOR");
        }
        cursors.add(page.nextCursor);
        cursor = page.nextCursor;
      }
    },
    CACHE_TTL_MS,
  ).then((playlists) =>
    playlists.filter(
      (playlist) => !isLibraryResourcePendingRemoval("playlists", playlist.id),
    ),
  );
}

export function invalidateUserPlaylists(userId: string) {
  invalidateCachedQuery(cacheKey(userId));
}

function syncUserPlaylistMutation(
  playlistId: string,
  userId?: string,
  details?: Parameters<typeof notifyPlaylistChanged>[2],
) {
  invalidateCachedQuery(`playlist:${playlistId}`);
  if (userId) invalidateUserPlaylists(userId);
  // Dispatch the playlist event first: creation consumers can render the
  // returned title immediately, before the background Library refresh starts.
  notifyPlaylistChanged(playlistId, userId, details);
  refreshLibraryResources({
    resourceType: "playlists",
    resourceId: playlistId,
    operation: "update",
  });
}

export async function createUserPlaylistFromSource(input: {
  name: string;
  description: string;
  source: unknown;
  userId?: string;
}) {
  const { data } = await http.post<{ id: string }>("/playlists/from-source", {
    name: input.name,
    description: input.description,
    source: input.source,
  });
  syncUserPlaylistMutation(data.id, input.userId, {
    operation: "create",
    playlist: { id: data.id, name: input.name },
  });
  return data;
}

export async function updateUserPlaylist(
  playlistId: string,
  input: { name: string; description: string; userId?: string },
) {
  await http.patch(`/playlists/${encodeURIComponent(playlistId)}`, {
    name: input.name,
    description: input.description,
  });
  syncUserPlaylistMutation(playlistId, input.userId);
}

export async function addSongToUserPlaylist(
  playlistId: string,
  songId: string,
  userId?: string,
) {
  await http.post(`/playlists/${encodeURIComponent(playlistId)}/tracks`, {
    songId,
  });
  syncUserPlaylistMutation(playlistId, userId);
}

export async function removeSongFromUserPlaylist(
  playlistId: string,
  songId: string,
  userId?: string,
) {
  await http.delete(
    `/playlists/${encodeURIComponent(playlistId)}/tracks/${encodeURIComponent(songId)}`,
  );
  syncUserPlaylistMutation(playlistId, userId);
}

export async function addSourceToUserPlaylist(
  playlistId: string,
  source: ContextMenuContext,
  userId?: string,
) {
  await http.post(`/playlists/${encodeURIComponent(playlistId)}/from-source`, {
    source,
  });
  syncUserPlaylistMutation(playlistId, userId);
}

export async function getUserPlaylist(playlistId: string) {
  const response = await http.get<{ playlist: UserPlaylistDetail }>(
    `/playlists/${encodeURIComponent(playlistId)}`,
    { params: { includeTracks: false } },
  );
  return response.data.playlist;
}

export async function listUserPlaylistTracks(
  playlistId: string,
  params?: { cursor?: string; limit?: number },
) {
  const response = await http.get<UserPlaylistTrackPage>(
    `/playlists/${encodeURIComponent(playlistId)}/tracks`,
    { params: { cursor: params?.cursor, limit: params?.limit ?? 40 } },
  );
  return response.data;
}

/** Loads every cursor page for actions that require a complete playback queue. */
export async function getAllUserPlaylistTracks(playlistId: string) {
  const songs: SongSummary[] = [];
  const songIds = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | undefined;

  while (true) {
    const page = await listUserPlaylistTracks(playlistId, {
      cursor,
      limit: 50,
    });
    for (const song of page.songs ?? []) {
      if (songIds.has(song.id)) continue;
      songIds.add(song.id);
      songs.push(song);
    }
    if (!page.hasMore) return songs;
    if (!page.nextCursor || cursors.has(page.nextCursor)) {
      throw new Error("INVALID_PLAYLIST_TRACK_CURSOR");
    }
    cursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
}

export async function getPlaylistSourceMembership(source: ContextMenuContext) {
  const response = await http.post<{ playlistIds?: string[] }>(
    "/playlists/source-memberships",
    { source },
  );
  return new Set(response.data.playlistIds ?? []);
}

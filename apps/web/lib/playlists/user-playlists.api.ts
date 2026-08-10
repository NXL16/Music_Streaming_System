import { getCachedQuery, invalidateCachedQuery } from "@/lib/api/query-cache";
import { http } from "@/lib/api/http";

export type UserPlaylistSummary = {
  id: string;
  name: string;
};

const CACHE_TTL_MS = 60_000;

function cacheKey(userId: string) {
  return `user-playlists:${userId}`;
}

export function getUserPlaylists(userId: string) {
  return getCachedQuery(
    cacheKey(userId),
    async () => {
      const response = await http.get<{ playlists?: UserPlaylistSummary[] }>(
        `/playlists/user/${encodeURIComponent(userId)}`,
        { params: { limit: 50 } },
      );

      return response.data.playlists ?? [];
    },
    CACHE_TTL_MS,
  );
}

export function invalidateUserPlaylists(userId: string) {
  invalidateCachedQuery(cacheKey(userId));
}

import { http } from "@/lib/api/http";
import { getCachedQuery } from "@/lib/api/query-cache";

export type StaticLyricLine = {
  text: string;
  vocalistType: "PRIMARY" | "SECONDARY";
};

type StaticLyricsResponse = {
  songId: string;
  lines: StaticLyricLine[];
};

const STATIC_LYRICS_CACHE_TTL_MS = 5 * 60 * 1_000;

/** Static lyrics have no timing; the player may use them only as a non-synced fallback. */
export function getSongStaticLyrics(songId: string) {
  return getCachedQuery(
    `song-static-lyrics:${songId}`,
    async (signal) => {
      const response = await http.get<StaticLyricsResponse>(
        `/songs/${encodeURIComponent(songId)}/static-lyrics`,
        { signal },
      );
      return Array.isArray(response.data.lines) ? response.data.lines : [];
    },
    STATIC_LYRICS_CACHE_TTL_MS,
  );
}

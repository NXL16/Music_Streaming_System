import { http } from "@/lib/api/http";
import { getCachedQuery } from "@/lib/api/query-cache";

export type LyricLine = {
  position: number;
  startTimeMs: number;
  endTimeMs: number;
  text: string;
  kind?: "LYRIC" | "INSTRUMENTAL";
};

type LyricsResponse = {
  lines: LyricLine[];
};

const LYRICS_CACHE_TTL_MS = 5 * 60 * 1000;

export function getSongLyrics(songId: string) {
  return getCachedQuery(
    `song-lyrics:${songId}`,
    async (signal) => {
      const response = await http.get<LyricsResponse>(
        `/songs/${encodeURIComponent(songId)}/lyrics`,
        { signal },
      );
      return response.data.lines;
    },
    LYRICS_CACHE_TTL_MS,
  );
}

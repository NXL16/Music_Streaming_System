import { routeSlug } from "./route-slug";

/**
 * The public song route follows the same slug/id convention as albums and
 * playlists. Its ID is the release-track UUID, so the URL itself preserves
 * whether the listener opened the song from a Single, EP, or Album.
 */
export function songRoute(songTitle: string, songId: string) {
  return `/song/${encodeURIComponent(routeSlug(songTitle, "song"))}/${encodeURIComponent(songId)}`;
}

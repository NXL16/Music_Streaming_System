import { routeSlug } from "./route-slug";

export function musicVideoRoute(songTitle: string, songVideoId: string) {
  return `/music-video/${routeSlug(songTitle, "music-video")}/${encodeURIComponent(songVideoId)}`;
}

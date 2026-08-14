import { http } from "@/lib/api/http";
import {
  HERO_ARTWORK_WIDTHS,
  PLAYLIST_ARTWORK_WIDTHS,
} from "@/lib/media/artwork-slots";

/** Requests the API-owned renderer and returns its canonical 632w URL. */
export async function uploadGeneratedPlaylistCover(playlistId: string) {
  const { data } = await http.post<{ artworkUrl: string }>(
    `/playlists/${encodeURIComponent(playlistId)}/generate-cover`,
  );
  return data.artworkUrl;
}

export function playlistArtworkVariants(artworkUrl: string) {
  const match = artworkUrl.match(/^(.*\/)632w\.webp$/);
  if (!match) return undefined;
  return {
    renditions: PLAYLIST_ARTWORK_WIDTHS.map((width) => ({
      width,
      url: `${match[1]}${width}w.webp`,
    })),
    hero: {
      renditions: HERO_ARTWORK_WIDTHS.map((width) => ({
        width,
        url: `${match[1]}hero/${width}w.webp`,
      })),
    },
  };
}

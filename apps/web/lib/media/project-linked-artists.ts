import { artistRoute } from "@/lib/catalog/artist-route";
import type { MediaCardArtist } from "./media-card.types";

export type LinkedArtistSource = {
  id: string;
  name: string;
  url?: string;
};

/** Converts canonical artist metadata to deduplicated application links. */
export function projectLinkedArtists(
  artists: LinkedArtistSource[],
): MediaCardArtist[] {
  const seen = new Set<string>();

  return artists.flatMap((artist) => {
    if (!artist.name || seen.has(artist.id)) return [];
    seen.add(artist.id);
    return [
      {
        id: artist.id,
        name: artist.name,
        url: artist.url ? artistRoute(artist.url, artist.id) : "",
      },
    ];
  });
}

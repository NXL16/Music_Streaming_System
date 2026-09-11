import { useMemo } from "react";
import {
  artistNamesFromText,
  normalizedArtistName,
} from "./artist-names";

export type FormattedArtist = {
  id: string;
  name: string;
  url?: string;
};

type ArtistInput = {
  id?: string;
  name: string;
  url?: string;
};

type UseFormattedArtistsOptions = {
  artists?: ArtistInput[];
  fallbackText?: string;
};

/**
 * Structured artist credits are the source of truth. The text field exists
 * only for legacy records that do not have linked artist credits yet.
 */
export function useFormattedArtists({
  artists,
  fallbackText,
}: UseFormattedArtistsOptions): FormattedArtist[] {
  return useMemo(() => {
    const artistsByName = new Map(
      artists
        ?.map((artist) => ({
          id: artist.id ?? artist.name,
          name: artist.name.trim(),
          url: artist.url,
        }))
        .filter((artist) => artist.name)
        .map((artist) => [normalizedArtistName(artist.name), artist]) ?? [],
    );
    if (artistsByName.size) return [...artistsByName.values()];

    return artistNamesFromText(fallbackText ?? "").map((name) => ({
      id: name,
      name,
    }));
  }, [artists, fallbackText]);
}

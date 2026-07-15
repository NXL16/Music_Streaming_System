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
 * Uses artistName as the display source and structured artist records only to
 * decide which names can link to an artist page. Every caller can therefore
 * render contributors consistently with comma separators.
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
    const fallbackNames = artistNamesFromText(fallbackText ?? "");
    if (fallbackNames.length) {
      return fallbackNames.map(
        (name) =>
          artistsByName.get(normalizedArtistName(name)) ?? {
            id: name,
            name,
          },
      );
    }

    return [...artistsByName.values()];
  }, [artists, fallbackText]);
}

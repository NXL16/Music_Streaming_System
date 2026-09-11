import type {
  CatalogArtistResource,
  CatalogReference,
  CatalogResponse,
} from "./catalog.types";
import type { MediaCardArtist } from "@/lib/media/media-card.types";
import { projectLinkedArtists } from "@/lib/media/project-linked-artists";

/**
 * Resolves artist relationships from one Catalog response. This is the shared
 * source for card metadata and player tracks, so a displayed artist always
 * receives the same canonical route everywhere.
 */
export function catalogArtists(
  response: CatalogResponse,
  references: CatalogReference[] | undefined,
): MediaCardArtist[] {
  return catalogArtistsFromResources(response.resources.artists, references);
}

export function catalogArtistsFromResources(
  artists: Record<string, CatalogArtistResource>,
  references: CatalogReference[] | undefined,
): MediaCardArtist[] {
  return projectLinkedArtists(
    (references ?? []).flatMap((reference) => {
      const artist = artists[reference.id];
      return artist
        ? [
            {
              id: artist.id,
              name: artist.attributes.name,
              url: artist.attributes.url,
            },
          ]
        : [];
    }),
  );
}

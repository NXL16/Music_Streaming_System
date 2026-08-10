import { createAndHydrateMediaResourceCard } from "@/lib/media/normalize-media-resource";
import type { CatalogResponse } from "./catalog.types";
import { catalogArtists } from "./catalog-artists";

/** Hydrates canonical card metadata from every Catalog response, including detail pages. */
export function hydrateCatalogMediaEntities(response: CatalogResponse) {
  for (const album of Object.values(response.resources.albums)) {
    createAndHydrateMediaResourceCard(
      {
        id: album.id,
        type: "albums",
        name: album.attributes.name,
        url: album.attributes.url,
        artistName: album.attributes.artistName,
        artwork: album.attributes.artwork,
        contentRating: album.attributes.contentRating,
      },
      {
        cardType: "collection",
        artists: catalogArtists(response, album.relationships.artists?.data),
      },
      "catalog",
    );
  }

  for (const playlist of Object.values(response.resources.playlists)) {
    createAndHydrateMediaResourceCard(
      {
        id: playlist.id,
        type: "playlists",
        name: playlist.attributes.name,
        url: playlist.attributes.url,
        curatorName: playlist.attributes.curatorName || "Playlist",
        artwork: playlist.attributes.artwork,
      },
      { cardType: "collection" },
      "catalog",
    );
  }

  return response;
}

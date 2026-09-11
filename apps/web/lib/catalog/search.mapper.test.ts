import { describe, expect, it } from "vitest";
import { mapCatalogAlbumResources } from "./search.mapper";
import type {
  CatalogAlbumResource,
  CatalogArtistResource,
} from "./catalog.types";

const album = {
  id: "album-1",
  type: "albums",
  attributes: {
    name: "Guest Single",
    artistName: "Host Artist",
    url: "guest-single",
  },
  relationships: {
    artists: { data: [{ id: "artist-1", type: "artists" }] },
  },
} as CatalogAlbumResource;

const artistResources: Record<string, CatalogArtistResource> = {
  "artist-1": {
    id: "artist-1",
    type: "artists",
    href: "/v1/catalog/vn/artists/artist-1",
    attributes: {
      name: "Host Artist",
      url: "host-artist",
      genreNames: [],
    },
  },
};

describe("mapCatalogAlbumResources", () => {
  it("keeps linked artists when album resources are mapped outside a catalog response", () => {
    const [card] = mapCatalogAlbumResources(
      [album],
      {},
      artistResources,
    );

    expect(card.artists).toEqual([
      {
        id: "artist-1",
        name: "Host Artist",
        url: "/artist/host-artist/artist-1",
      },
    ]);
  });
});

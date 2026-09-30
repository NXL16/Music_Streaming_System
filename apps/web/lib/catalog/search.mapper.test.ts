import { describe, expect, it } from "vitest";
import { mapCatalogAlbumResources, mapSearchResults } from "./search.mapper";
import type {
  CatalogAlbumResource,
  CatalogArtistResource,
  CatalogPlaylistResource,
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

describe("mapSearchResults", () => {
  it("maps public playlist resources into the playlist result group", () => {
    const playlist = {
      id: "playlist-1",
      type: "playlists",
      href: "/v1/catalog/vn/playlists/playlist-1",
      attributes: {
        name: "Late Night Mix",
        curatorName: "M404",
        playlistType: "editorial",
        audioTraits: [],
        descriptionShort: "",
        descriptionStandard: "",
        lastModifiedDate: "",
        url: "late-night-mix",
      },
      relationships: { tracks: { href: "", data: [] } },
    } as CatalogPlaylistResource;

    const results = mapSearchResults({
      data: [{ id: playlist.id, type: "playlists", href: playlist.href }],
      resources: {
        albums: {},
        artists: {},
        playlists: { [playlist.id]: playlist },
        songs: {},
      },
    });

    expect(results.playlists).toHaveLength(1);
    expect(results.playlists[0]).toMatchObject({
      resourceId: playlist.id,
      resourceType: "playlists",
      title: playlist.attributes.name,
      subtitle: playlist.attributes.curatorName,
    });
    expect(results.isEmpty).toBe(false);
  });
});

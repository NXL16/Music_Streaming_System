import { describe, expect, it } from "vitest";
import { mapCatalogTracks } from "./catalog.mapper";
import type { CatalogResponse } from "./catalog.types";

const response = {
  data: [{ id: "album-context", type: "albums" }],
  resources: {
    albums: {
      "album-context": {
        id: "album-context",
        attributes: {
          name: "Context Album",
          url: "context-album",
          artwork: {
            url: "https://image.example/{w}x{h}.jpg",
            bgColor: "112233",
            variants: {
              renditions: [
                { url: "https://image.example/40.jpg", width: 40 },
                { url: "https://image.example/296.jpg", width: 296 },
                { url: "https://image.example/632.jpg", width: 632 },
              ],
            },
          },
        },
        relationships: { tracks: { data: [{ id: "song-1", type: "songs" }] } },
      },
    },
    playlists: {},
    songs: {
      "song-1": {
        id: "song-1",
        attributes: {
          name: "Track",
          artistName: "Artist One",
          albumName: "Canonical Album",
          durationInMillis: 180_400,
          releaseDate: "2026-01-01",
          contentRating: "explicit",
        },
        relationships: {
          artists: { data: [{ id: "artist-1", type: "artists" }] },
          albums: { data: [{ id: "canonical-album", type: "albums" }] },
        },
      },
    },
    artists: {
      "artist-1": {
        id: "artist-1",
        attributes: { name: "Artist One", url: "artist-one" },
      },
    },
  },
} as unknown as CatalogResponse;

describe("mapCatalogTracks", () => {
  it("uses the shared player contract while preserving the root album context", () => {
    const [track] = mapCatalogTracks(response);

    expect(track).toMatchObject({
      id: "song-1",
      url: "/song/song-1",
      album: "Context Album",
      albumUrl: "/album/context-album/album-context",
      durationSec: 180,
      playbackUrl: "mse:song-1",
      artworkBgColor: "#112233",
    });
    expect(track.artists).toEqual([
      {
        id: "artist-1",
        name: "Artist One",
        url: "/artist/artist-one/artist-1",
      },
    ]);
    expect(track.artworkSrcSet).toContain("296w");
    expect(track.thumbnailArtworkSrcSet).toContain("40w");
  });
});

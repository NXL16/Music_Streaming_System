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
        relationships: {
          tracks: {
            data: [
              {
                id: "song-1",
                type: "songs",
                meta: { releaseTrackId: "release-track-1" },
              },
            ],
          },
        },
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
      url: "/song/track/release-track-1",
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
    expect(track.mediaSessionArtworkUrl).toBe("https://image.example/632.jpg");
  });

  it("uses an explicit song-detail album context instead of the first relation", () => {
    const directSongResponse = {
      ...response,
      data: [{ id: "song-1", type: "songs" }],
      resources: {
        ...response.resources,
        albums: {
          ...response.resources.albums,
          "canonical-album": {
            id: "canonical-album",
            attributes: {
              name: "Canonical Album",
              url: "canonical-album",
              artwork: {
                url: "https://image.example/canonical.jpg",
                bgColor: "111111",
              },
            },
          },
          "album-2": {
            id: "album-2",
            attributes: {
              name: "Single",
              url: "single",
              artwork: {
                url: "https://image.example/single.jpg",
                bgColor: "222222",
              },
            },
          },
        },
        songs: {
          ...response.resources.songs,
          "song-1": {
            ...response.resources.songs["song-1"],
            relationships: {
              ...response.resources.songs["song-1"].relationships,
              albums: {
                data: [
                  { id: "canonical-album", type: "albums" },
                  {
                    id: "album-2",
                    type: "albums",
                    meta: { releaseTrackId: "release-track-2" },
                  },
                ],
              },
            },
          },
        },
      },
    } as unknown as CatalogResponse;
    const [track] = mapCatalogTracks(directSongResponse, {
      albumId: "album-2",
    });

    expect(track).toMatchObject({
      albumId: "album-2",
      url: "/song/track/release-track-2",
      artworkUrl: "https://image.example/single.jpg",
      artworkBgColor: "#222222",
    });
  });

  it("does not fall back when a requested album does not contain the song", () => {
    expect(mapCatalogTracks(response, { albumId: "missing-album" })).toEqual([]);
  });
});

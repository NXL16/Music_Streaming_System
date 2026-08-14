import { describe, expect, it } from "vitest";
import { projectPlayerSong, projectSongSummary } from "./project-song-summary";

describe("projectSongSummary", () => {
  it("projects all artist and album links from one song source", () => {
    const track = projectSongSummary({
      id: "song-1",
      title: "Track",
      artist: "Artist One, Artist Two",
      artists: [
        { id: "artist-1", name: "Artist One", url: "artist-one" },
        { id: "artist-2", name: "Artist Two", url: "artist-two" },
      ],
      album: "Album",
      albumId: "album-1",
      albumUrl: "album",
    });

    expect(track.url).toBe("/song/song-1");
    expect(track.artists).toEqual([
      {
        id: "artist-1",
        name: "Artist One",
        url: "/artist/artist-one/artist-1",
      },
      {
        id: "artist-2",
        name: "Artist Two",
        url: "/artist/artist-two/artist-2",
      },
    ]);
    expect(track.albumUrl).toBe("/album/album/album-1");
  });

  it("keeps the player contract stable for every normalized song adapter", () => {
    const track = projectPlayerSong({
      id: "song-1",
      title: "Track",
      artists: [
        {
          id: "artist-1",
          name: "Artist One",
          url: "/artist/artist-one/artist-1",
        },
      ],
      album: "Album",
      albumId: "album-1",
      albumUrl: "album",
      durationSec: 180,
      artworkUrl: "cover.jpg",
      artworkSrcSet: "cover-316.jpg 316w",
      thumbnailArtworkSrcSet: "cover-40.jpg 40w",
      contentRating: "explicit",
    });

    expect(track).toMatchObject({
      url: "/song/song-1",
      artist: "Artist One",
      albumUrl: "/album/album/album-1",
      playbackUrl: "mse:song-1",
      artworkSrcSet: "cover-316.jpg 316w",
      thumbnailArtworkSrcSet: "cover-40.jpg 40w",
    });
  });
});

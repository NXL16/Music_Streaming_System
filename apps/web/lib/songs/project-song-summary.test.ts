import { describe, expect, it } from "vitest";
import { projectSongSummary } from "./project-song-summary";

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
      { id: "artist-1", name: "Artist One", url: "/artist/artist-one/artist-1" },
      { id: "artist-2", name: "Artist Two", url: "/artist/artist-two/artist-2" },
    ]);
    expect(track.albumUrl).toBe("/album/album/album-1");
  });
});

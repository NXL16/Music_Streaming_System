import { describe, expect, it } from "vitest";
import {
  createMediaResourceCard,
  mediaResourceRoute,
} from "./normalize-media-resource";

describe("normalize-media-resource", () => {
  it("creates the same canonical route for each resource type", () => {
    expect(
      mediaResourceRoute({
        id: "artist-1",
        type: "artists",
        name: "Artist",
        url: "artist",
      }),
    ).toBe("/artist/artist/artist-1");
    expect(
      mediaResourceRoute({
        id: "album-1",
        type: "albums",
        name: "Album",
        url: "album",
      }),
    ).toBe("/album/album/album-1");
    expect(
      mediaResourceRoute({
        id: "playlist-1",
        type: "playlists",
        name: "Playlist",
        url: "playlist",
      }),
    ).toBe("/playlist/playlist/playlist-1");
    expect(
      mediaResourceRoute({
        id: "playlist-1",
        type: "playlists",
        name: "Playlist",
        isUserPlaylist: true,
      }),
    ).toBe("/library/playlist/playlist-1");
  });

  it("projects canonical artwork into hero srcSet", () => {
    const card = createMediaResourceCard(
      {
        id: "playlist-1",
        type: "playlists",
        name: "Playlist",
        url: "playlist",
        artwork: {
          url: "original.webp",
          bgColor: "112233",
          variants: {
            hero: {
              renditions: [
                { url: "hero-450.webp", width: 450 },
                { url: "hero-1200.webp", width: 1200 },
              ],
            },
          },
        },
      },
      { cardType: "hero" },
    );

    expect(card.slug).toBe("/playlist/playlist/playlist-1");
    expect(card.imageSrcSet).toBe("hero-450.webp 450w, hero-1200.webp 1200w");
    expect(card.artworkColors.bg).toBe("#112233");
  });
});

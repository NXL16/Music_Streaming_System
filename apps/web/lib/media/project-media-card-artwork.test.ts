import { describe, expect, it } from "vitest";
import { projectMediaCardArtwork } from "./project-media-card-artwork";
import type { MediaCardProps } from "./media-card.types";

const baseCard: MediaCardProps = {
  id: "playlists-daily-mix",
  resourceId: "daily-mix",
  resourceType: "playlists",
  cardType: "collection",
  title: "Daily Mix",
  subtitle: "Musical",
  imageUrl: "stale-632w.webp",
  imageSrcSet: "stale-632w.webp",
  artworkColors: { bg: "#111111", main: "#111111" },
  artwork: {
    url: "original.webp",
    bgColor: "112233",
    variants: {
      renditions: [
        { url: "cover-316w.webp", width: 316 },
        { url: "cover-632w.webp", width: 632 },
      ],
      hero: {
        renditions: [
          { url: "hero-450w.webp", width: 450 },
          { url: "hero-600w.webp", width: 600 },
          { url: "hero-900w.webp", width: 900 },
          { url: "hero-1200w.webp", width: 1200 },
        ],
      },
    },
  },
};

describe("projectMediaCardArtwork", () => {
  it("projects the same canonical artwork into cover and hero renditions", () => {
    const cover = projectMediaCardArtwork(baseCard);
    const hero = projectMediaCardArtwork({ ...baseCard, cardType: "hero" });

    expect(cover.imageSrcSet).toBe("cover-316w.webp 316w, cover-632w.webp 632w");
    expect(hero.imageSrcSet).toBe(
      "hero-450w.webp 450w, hero-600w.webp 600w, hero-900w.webp 900w, hero-1200w.webp 1200w",
    );
    expect(hero.artworkColors.bg).toBe("#112233");
  });
});

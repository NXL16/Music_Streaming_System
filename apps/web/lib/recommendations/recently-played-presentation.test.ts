import { describe, expect, it } from "vitest";
import type { MediaCardProps } from "@/lib/media/media-card.types";
import { normalizeRecentlyPlayedCard } from "./recently-played-presentation";

const baseCard: MediaCardProps = {
  id: "albums-1",
  resourceId: "1",
  resourceType: "albums",
  cardType: "hero",
  title: "Album",
  subtitle: "Artist",
  imageUrl: "https://example.com/artwork.jpg",
  imageSrcSet: "https://example.com/artwork.jpg",
  artworkColors: { bg: "#111111", main: "#111111" },
  altText: "Album",
};

describe("normalizeRecentlyPlayedCard", () => {
  it("converts only hero cards to compact collection cards", () => {
    expect(normalizeRecentlyPlayedCard({ ...baseCard, videoSrc: "video.mp4" }))
      .toMatchObject({ cardType: "collection", videoSrc: undefined });
  });

  it("keeps station cards unchanged", () => {
    const station = { ...baseCard, cardType: "station" as const };

    expect(normalizeRecentlyPlayedCard(station)).toBe(station);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import type { MediaCardProps } from "./media-card.types";
import {
  getMediaEntity,
  hydrateMediaEntity,
  invalidateAllMediaEntities,
} from "./media-entity-store";

function card(overrides: Partial<MediaCardProps> = {}): MediaCardProps {
  return {
    id: "albums-1",
    resourceId: "1",
    resourceType: "albums",
    cardType: "collection",
    title: "Recommendation title",
    subtitle: "Recommendation artist",
    imageUrl: "recommendation.jpg",
    imageSrcSet: "recommendation.jpg 1x",
    artworkColors: { bg: "#111111", main: "#111111" },
    ...overrides,
  };
}

describe("media entity store", () => {
  afterEach(invalidateAllMediaEntities);

  it("keeps Catalog metadata over a lower-priority recommendation snapshot", () => {
    hydrateMediaEntity(card({ contentRating: "clean" }), "recommendation");
    hydrateMediaEntity(
      card({
        title: "Catalog title",
        contentRating: "explicit",
        imageUrl: "catalog.jpg",
      }),
      "catalog",
    );

    expect(getMediaEntity(card())).toMatchObject({
      title: "Catalog title",
      contentRating: "explicit",
    });
  });

  it("does not share artwork renditions across card presentations", () => {
    hydrateMediaEntity(
      card({
        cardType: "hero",
        imageUrl: "hero-600x800.jpg",
        imageSrcSet: "hero-600x800.jpg 600w",
        artworkColors: { bg: "#222222", main: "#222222" },
      }),
      "recommendation",
    );
    hydrateMediaEntity(
      card({
        imageUrl: "collection-316.jpg",
        imageSrcSet: "collection-316.jpg 316w",
        artworkColors: { bg: "#333333", main: "#333333" },
      }),
      "catalog",
    );

    const entity = getMediaEntity(card());
    expect(entity).not.toHaveProperty("imageUrl");
    expect(entity).not.toHaveProperty("imageSrcSet");
    expect(entity).not.toHaveProperty("artworkColors");
  });
});

import { afterEach, describe, expect, it } from "vitest";
import {
  createAndHydrateMediaCard,
  createMediaCard,
  type MediaCardInput,
} from "./media-card";
import {
  getMediaEntity,
  invalidateAllMediaEntities,
} from "./media-entity-store";

const input: MediaCardInput = {
  id: "albums-1",
  resourceId: "1",
  resourceType: "albums",
  cardType: "collection",
  title: "Album",
  subtitle: "Artist",
  imageUrl: "album.jpg",
  imageSrcSet: "album.jpg",
  artworkColors: { bg: "#111111", main: "#111111" },
  altText: "Album",
};

describe("media-card factory", () => {
  afterEach(invalidateAllMediaEntities);

  it("is pure when mapping UI data during render", () => {
    const card = createMediaCard(input);

    expect(getMediaEntity(card)).toBeUndefined();
  });

  it("hydrates only when explicitly requested from a safe boundary", () => {
    const card = createAndHydrateMediaCard(input, "catalog");

    expect(getMediaEntity(card)?.title).toBe("Album");
  });
});

import { describe, expect, it, beforeEach } from "vitest";
import {
  clearRecentlyPlayedSnapshot,
  getRecentlyPlayedSnapshot,
  prependRecentlyPlayedSnapshot,
  setRecentlyPlayedSnapshot,
} from "./recently-played-snapshot";
import type { MediaCardProps } from "@/components/media/media-card.types";

const firstItem = {
  id: "albums:one",
  resourceId: "one",
  resourceType: "albums",
  cardType: "collection",
  title: "First album",
  subtitle: "Artist",
  imageUrl: "",
  imageSrcSet: "",
  artworkColors: { bg: "#000000", main: "#000000" },
} satisfies MediaCardProps;

const secondItem = {
  ...firstItem,
  id: "albums:two",
  resourceId: "two",
  title: "New album",
} satisfies MediaCardProps;

describe("recently played snapshot", () => {
  beforeEach(clearRecentlyPlayedSnapshot);

  it("updates an existing Home snapshot while Home is unmounted", () => {
    setRecentlyPlayedSnapshot({
      id: "user-recently-played",
      title: "Recently Played",
      displayKind: "MusicCoverShelf",
      sourceDisplayKind: "MusicCoverShelf",
      modelVersion: 1,
      hasMore: false,
      items: [firstItem],
    });

    prependRecentlyPlayedSnapshot(secondItem);

    expect(getRecentlyPlayedSnapshot()?.items).toEqual([secondItem, firstItem]);
  });

  it("does not replace an unfetched snapshot with an incomplete one-item shelf", () => {
    prependRecentlyPlayedSnapshot(secondItem);

    expect(getRecentlyPlayedSnapshot()).toBeUndefined();
  });
});

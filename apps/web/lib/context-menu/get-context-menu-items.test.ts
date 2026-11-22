import { describe, expect, it } from "vitest";
import { contextMenuPath } from "./copy-link";
import { getContextMenuItems } from "./get-context-menu-items";
import { getMediaCardMenuContext } from "./media-card-menu-context";
import { projectLibraryMediaCard } from "@/lib/library/library-media-card.mapper";

it("preserves Library album queue filtering when card menus use the shared mapper", () => {
  const card = projectLibraryMediaCard({
    resourceType: "albums",
    resourceId: "album-1",
    title: "Album",
    subtitle: "Artist",
    artworkUrl: "",
    catalogUrl: "album",
    contentRating: "",
    artists: [],
  });
  expect(getMediaCardMenuContext(card, "user-1")).toMatchObject({
    kind: "collection",
    resourceId: "album-1",
    sourceOrigin: "catalog",
    isLibraryView: true,
    userId: "user-1",
  });
  expect(
    getMediaCardMenuContext(
      { ...card, slug: "/album/album/album-1" },
      "user-1",
    ),
  ).toMatchObject({ isLibraryView: false });
});

describe("Music Video context menu", () => {
  it("reuses Song actions while omitting Station and linking credits to the video", () => {
    const context = {
      kind: "video",
      videoId: "video-1",
      songId: "song-1",
      releaseTrackId: "release-track-1",
      title: "Music Video Song",
      href: "/music-video/music-video-song/video-1",
    } as const;
    const itemIds = getContextMenuItems(context).map((item) => item.id);

    expect(itemIds).toContain("add-to-library");
    expect(itemIds).toContain("add-to-playlist");
    expect(itemIds).toContain("favourite");
    expect(itemIds).toContain("view-credits");
    expect(itemIds).toContain("copy-link");
    expect(itemIds).not.toContain("create-station");
    expect(itemIds).not.toContain("show-album");
    expect(
      getContextMenuItems(context).find((item) => item.id === "view-credits")
        ?.href,
    ).toBe(context.href);
    expect(contextMenuPath(context)).toBe(context.href);
  });
});

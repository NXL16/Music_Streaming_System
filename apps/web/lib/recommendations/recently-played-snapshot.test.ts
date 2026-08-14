import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  clearRecentlyPlayedSnapshot,
  getRecentlyPlayedSnapshot,
  isRecentlyPlayedSnapshotStale,
  prependRecentlyPlayedSnapshot,
  RECENTLY_PLAYED_SNAPSHOT_TTL_MS,
  removeRecentlyPlayedPlaylistSnapshot,
  restoreRecentlyPlayedPlaylistSnapshot,
  setRecentlyPlayedSnapshot,
  updateRecentlyPlayedPlaylistSnapshot,
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
  beforeEach(() => {
    vi.useRealTimers();
    clearRecentlyPlayedSnapshot();
  });

  it("marks a cached shelf stale after its refresh TTL", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T00:00:00Z"));
    setRecentlyPlayedSnapshot(null);

    expect(isRecentlyPlayedSnapshotStale()).toBe(false);
    vi.advanceTimersByTime(RECENTLY_PLAYED_SNAPSHOT_TTL_MS);
    expect(isRecentlyPlayedSnapshotStale()).toBe(true);
  });

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

  it("restores a removed playlist to its previous Recently Played position", () => {
    const playlist = {
      ...firstItem,
      id: "playlists:mine",
      resourceId: "mine",
      // Optimistic playback cards are allowed to use a source-specific type.
      // Playlist metadata must still be updated by the stable resourceId.
      resourceType: "user-playlists",
    };
    setRecentlyPlayedSnapshot({
      id: "user-recently-played",
      title: "Recently Played",
      displayKind: "MusicCoverShelf",
      sourceDisplayKind: "MusicCoverShelf",
      modelVersion: 1,
      hasMore: false,
      items: [firstItem, playlist, secondItem],
    });

    const removed = removeRecentlyPlayedPlaylistSnapshot("mine");
    expect(getRecentlyPlayedSnapshot()?.items).toEqual([firstItem, secondItem]);

    restoreRecentlyPlayedPlaylistSnapshot(removed);
    expect(getRecentlyPlayedSnapshot()?.items).toEqual([
      firstItem,
      playlist,
      secondItem,
    ]);
  });

  it("updates playlist metadata in the cached Recently Played shelf", () => {
    const playlist = {
      ...firstItem,
      id: "playlists:mine",
      resourceId: "mine",
      resourceType: "user-playlists",
      title: "Before",
    };
    setRecentlyPlayedSnapshot({
      id: "user-recently-played",
      title: "Recently Played",
      displayKind: "MusicCoverShelf",
      sourceDisplayKind: "MusicCoverShelf",
      modelVersion: 1,
      hasMore: false,
      items: [playlist],
    });

    updateRecentlyPlayedPlaylistSnapshot({
      playlistId: "mine",
      title: "After",
    });

    expect(getRecentlyPlayedSnapshot()?.items[0]?.title).toBe("After");
  });
});

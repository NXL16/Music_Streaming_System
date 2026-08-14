import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const songApi = vi.hoisted(() => ({
  addFavoriteSong: vi.fn(),
  listFavoriteSongs: vi.fn(),
  removeFavoriteSong: vi.fn(),
}));

vi.mock("@/lib/songs/song.api", () => songApi);

import { clearFavoriteStore, useFavoriteStore } from "./use-favorite-store";

function song(id: string) {
  return {
    id,
    title: `Song ${id}`,
    artist: "Artist",
    album: "Album",
    isPublic: true,
    status: 3 as const,
    durationSec: 180,
    createdAt: 0,
    coverUrl: "",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearFavoriteStore();
});

afterEach(() => clearFavoriteStore());

describe("favorite store hydration", () => {
  it("loads every cursor page and keeps a single copy of each song", async () => {
    songApi.listFavoriteSongs
      .mockResolvedValueOnce({
        songs: [song("one"), song("two")],
        hasMore: true,
        nextCursor: "cursor-1",
        collection: { key: "favorite", title: "Favourite Songs" },
      })
      .mockResolvedValueOnce({
        songs: [song("two"), song("three")],
        hasMore: false,
        nextCursor: "",
      });

    await useFavoriteStore.getState().hydrate();

    expect(useFavoriteStore.getState().songs.map((item) => item.id)).toEqual([
      "one",
      "two",
      "three",
    ]);
    expect(useFavoriteStore.getState().collection).toEqual({
      key: "favorite",
      title: "Favourite Songs",
    });
    expect(songApi.listFavoriteSongs).toHaveBeenNthCalledWith(
      1,
      { cursor: undefined, limit: 50 },
      { force: false },
    );
    expect(songApi.listFavoriteSongs).toHaveBeenNthCalledWith(
      2,
      { cursor: "cursor-1", limit: 50 },
      { force: false },
    );
  });

  it("rejects a repeated cursor instead of looping forever", async () => {
    songApi.listFavoriteSongs
      .mockResolvedValueOnce({
        songs: [song("one")],
        hasMore: true,
        nextCursor: "cursor-1",
      })
      .mockResolvedValueOnce({
        songs: [song("two")],
        hasMore: true,
        nextCursor: "cursor-1",
      });

    await expect(useFavoriteStore.getState().hydrate()).rejects.toThrow(
      "INVALID_FAVORITES_CURSOR",
    );
    expect(useFavoriteStore.getState().loaded).toBe(false);
  });
});

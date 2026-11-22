import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const songApi = vi.hoisted(() => ({
  addFavoriteSong: vi.fn(),
  listFavoriteSongs: vi.fn(),
  removeFavoriteSong: vi.fn(),
  pendingRemovals: new Set<string>(),
}));
vi.mock("./favorite-events", () => ({
  notifyFavoriteChanged: vi.fn(),
  subscribeFavoriteChanges: vi.fn(),
}));
vi.mock("@/lib/library/library-resources.api", () => ({
  isLibraryResourcePendingRemoval: (
    _type: string,
    id: string,
    albumId?: string,
  ) => songApi.pendingRemovals.has(JSON.stringify([albumId, id])),
  optimisticallyAddLibraryResource: () => [],
  revalidateLibraryResources: vi.fn(),
  rollbackOptimisticLibraryAddition: vi.fn(),
}));

vi.mock("@/lib/songs/song.api", () => songApi);

import {
  clearFavoriteStore,
  useFavoriteStore,
  removeFavoriteSongsFromStore,
  restoreFavoriteSongsToStore,
} from "./use-favorite-store";
import { librarySongKey } from "@/lib/library/library-song-key";

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
  songApi.pendingRemovals.clear();
});

afterEach(() => clearFavoriteStore());

describe("favorite store hydration", () => {
  it("checks pending Library deletions again after all cursor pages finish", async () => {
    const large = { ...song("b"), albumId: "large" };
    const single = { ...song("b"), albumId: "single" };
    const lastPage = Promise.withResolvers<{
      songs: never[];
      hasMore: boolean;
    }>();
    songApi.listFavoriteSongs
      .mockResolvedValueOnce({
        songs: [large, single],
        hasMore: true,
        nextCursor: "next",
      })
      .mockReturnValueOnce(lastPage.promise);
    const hydration = useFavoriteStore.getState().hydrate();
    await vi.waitFor(() =>
      expect(songApi.listFavoriteSongs).toHaveBeenCalledTimes(2),
    );
    songApi.pendingRemovals.add(JSON.stringify(["single", "b"]));
    lastPage.resolve({ songs: [], hasMore: false });
    await hydration;
    expect(useFavoriteStore.getState().songs).toEqual([large]);
    expect(
      useFavoriteStore.getState().songKeys.has(librarySongKey("b", "single")),
    ).toBe(false);
  });

  it("ignores a stale read after a Library cascade and restores both releases on Undo", async () => {
    const copies = ["large", "single"].map((albumId) => ({
      ...song("b"),
      albumId,
    }));
    songApi.listFavoriteSongs.mockResolvedValueOnce({
      songs: copies,
      hasMore: false,
    });
    await useFavoriteStore.getState().hydrate();
    const stale = Promise.withResolvers<{
      songs: typeof copies;
      hasMore: boolean;
    }>();
    songApi.listFavoriteSongs.mockReturnValueOnce(stale.promise);
    const hydration = useFavoriteStore.getState().hydrate(true);
    removeFavoriteSongsFromStore(["b"], "single");
    stale.resolve({ songs: copies, hasMore: false });
    await hydration;
    expect(useFavoriteStore.getState().songs).toEqual([copies[0]]);
    restoreFavoriteSongsToStore([copies[1]]);
    expect(useFavoriteStore.getState().songKeys.size).toBe(2);
  });

  it("rolls back metadata as well as the star if an addition fails after a refresh", async () => {
    const large = { ...song("b"), albumId: "large" };
    const single = { ...song("b"), albumId: "single" };
    songApi.listFavoriteSongs.mockResolvedValueOnce({
      songs: [large],
      hasMore: false,
    });
    await useFavoriteStore.getState().hydrate();
    const pending = Promise.withResolvers<void>();
    songApi.addFavoriteSong.mockReturnValueOnce(pending.promise);
    const toggle = useFavoriteStore.getState().toggle("b", "single");
    await vi.waitFor(() => expect(songApi.addFavoriteSong).toHaveBeenCalled());
    songApi.listFavoriteSongs.mockResolvedValueOnce({
      songs: [large, single],
      hasMore: false,
    });
    await useFavoriteStore.getState().hydrate(true);
    expect(useFavoriteStore.getState().songs).toHaveLength(2);
    const failed = expect(toggle).rejects.toThrow("failed");
    pending.reject(new Error("failed"));
    await failed;
    expect(useFavoriteStore.getState().songs).toEqual([large]);
  });
  it("does not restore a previous session's favourite after a failed in-flight removal", async () => {
    songApi.listFavoriteSongs.mockResolvedValue({
      songs: [{ ...song("b"), albumId: "large" }],
      hasMore: false,
    });
    await useFavoriteStore.getState().hydrate();
    const pending = Promise.withResolvers<void>();
    songApi.removeFavoriteSong.mockReturnValue(pending.promise);
    const toggle = useFavoriteStore.getState().toggle("b", "large");
    await vi.waitFor(() =>
      expect(songApi.removeFavoriteSong).toHaveBeenCalled(),
    );
    clearFavoriteStore();
    const failed = expect(toggle).rejects.toThrow("failed");
    pending.reject(new Error("failed"));
    await failed;
    expect(useFavoriteStore.getState().songs).toEqual([]);
    expect(useFavoriteStore.getState().songKeys.size).toBe(0);
  });
  it("preserves both releases through hydration, removes one favourite and keeps the other after reloading", async () => {
    const large = { ...song("b"), albumId: "large" };
    const single = { ...song("b"), albumId: "single" };
    songApi.listFavoriteSongs.mockResolvedValue({
      songs: [large, single],
      hasMore: false,
    });
    await useFavoriteStore.getState().hydrate();
    expect(useFavoriteStore.getState().songs).toEqual([large, single]);
    songApi.removeFavoriteSong.mockResolvedValue({ success: true });
    await useFavoriteStore.getState().toggle("b", "single");
    expect(songApi.removeFavoriteSong).toHaveBeenCalledWith("b", "single");
    expect(
      useFavoriteStore.getState().songKeys.has(librarySongKey("b", "large")),
    ).toBe(true);
    expect(
      useFavoriteStore.getState().songKeys.has(librarySongKey("b", "single")),
    ).toBe(false);
    songApi.listFavoriteSongs.mockResolvedValue({
      songs: [large],
      hasMore: false,
    });
    await useFavoriteStore.getState().hydrate(true);
    expect(useFavoriteStore.getState().songs).toEqual([large]);
  });

  it("can favourite another release without toggling the first one off", async () => {
    const large = { ...song("b"), albumId: "large" };
    const single = { ...song("b"), albumId: "single" };
    songApi.listFavoriteSongs.mockResolvedValueOnce({
      songs: [large],
      hasMore: false,
    });
    await useFavoriteStore.getState().hydrate();
    songApi.listFavoriteSongs.mockResolvedValue({
      songs: [large, single],
      hasMore: false,
    });
    songApi.addFavoriteSong.mockResolvedValue({ success: true });
    await useFavoriteStore.getState().toggle("b", "single");
    expect(songApi.addFavoriteSong).toHaveBeenCalledWith("b", "single");
    expect(songApi.removeFavoriteSong).not.toHaveBeenCalled();
    await useFavoriteStore.getState().hydrate();
    expect(useFavoriteStore.getState().songs).toEqual([large, single]);
  });

  it("does not let a refresh resurrect a pending removal and restores just that release on failure", async () => {
    const copies = ["large", "single"].map((albumId) => ({
      ...song("b"),
      albumId,
    }));
    songApi.listFavoriteSongs.mockResolvedValue({
      songs: copies,
      hasMore: false,
    });
    await useFavoriteStore.getState().hydrate();
    const pending = Promise.withResolvers<void>();
    songApi.removeFavoriteSong.mockReturnValue(pending.promise);
    const toggle = useFavoriteStore.getState().toggle("b", "single");
    await vi.waitFor(() =>
      expect(songApi.removeFavoriteSong).toHaveBeenCalled(),
    );
    await useFavoriteStore.getState().hydrate(true);
    expect(
      useFavoriteStore.getState().songKeys.has(librarySongKey("b", "single")),
    ).toBe(false);
    const failed = expect(toggle).rejects.toThrow("failed");
    pending.reject(new Error("failed"));
    await failed;
    expect(useFavoriteStore.getState().songKeys.size).toBe(2);
    expect(useFavoriteStore.getState().songs).toHaveLength(2);
  });
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

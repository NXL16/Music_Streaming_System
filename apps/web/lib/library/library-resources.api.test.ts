import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCachedQuerySnapshot, setCachedQuery } from "@/lib/api/query-cache";

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/http", () => ({ http: api }));
vi.mock("@/lib/favorites/favorite-events", () => ({
  notifyFavoriteChanged: vi.fn(),
  subscribeFavoriteChanges: vi.fn(),
}));

import {
  beginLibraryResourceRemoval,
  clearLibraryResourcesCache,
  getLibraryMediaCards,
  getLibraryMediaCardsSnapshot,
  getLibraryResources,
  hasLibraryResourceMembership,
  isLibraryResourcePendingRemoval,
  optimisticallyAddLibraryResource,
  refreshLibraryResources,
  rollbackOptimisticLibraryAddition,
  isLibraryResource,
} from "./library-resources.api";
import {
  clearFavoriteStore,
  useFavoriteStore,
} from "@/lib/favorites/use-favorite-store";
import {
  clearPlaylistFavoriteStore,
  usePlaylistFavoriteStore,
} from "@/lib/favorites/use-playlist-favorite-store";

describe("Library media-card cache", () => {
  it("invalidates only the detail cache for the playlist that changed", () => {
    setCachedQuery("library:playlist-detail:p1:u1", { tracks: ["s1"] });
    setCachedQuery("library:playlist-detail:p2:u1", { tracks: ["s2"] });
    refreshLibraryResources({
      resourceType: "playlists",
      resourceId: "p1",
      operation: "update",
    });
    expect(
      getCachedQuerySnapshot("library:playlist-detail:p1:u1"),
    ).toBeUndefined();
    expect(getCachedQuerySnapshot("library:playlist-detail:p2:u1")).toEqual({
      tracks: ["s2"],
    });
  });
  it("exposes a fresh snapshot, including an empty Library, and removes it after expiration or mutation", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    try {
      api.get.mockResolvedValue({ data: { resources: [] } });
      await getLibraryMediaCards();
      expect(getLibraryMediaCardsSnapshot()).toEqual([]);
      clock.mockReturnValue(121001);
      expect(getLibraryMediaCardsSnapshot()).toBeUndefined();
      await getLibraryMediaCards();
      refreshLibraryResources({
        resourceType: "albums",
        resourceId: "a1",
        operation: "add",
      });
      expect(getLibraryMediaCardsSnapshot()).toBeUndefined();
    } finally {
      clock.mockRestore();
    }
  });
  it("invalidates loaded song lists on membership changes while preserving sort preferences", () => {
    const listKey = "library:song-pages:user-a:title:ascending";
    const sortKey = "library:song-sort:user-a";
    setCachedQuery(listKey, { songs: ["s1", "s2"] });
    setCachedQuery(sortKey, { sortBy: "title", direction: "ascending" });
    refreshLibraryResources({
      resourceType: "songs",
      resourceId: "s1",
      operation: "pin",
    });
    expect(getCachedQuerySnapshot(listKey)).toBeDefined();
    refreshLibraryResources({
      resourceType: "songs",
      resourceId: "s1",
      operation: "remove",
    });
    expect(getCachedQuerySnapshot(listKey)).toBeUndefined();
    expect(getCachedQuerySnapshot(sortKey)).toEqual({
      sortBy: "title",
      direction: "ascending",
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    clearLibraryResourcesCache();
    clearFavoriteStore();
    clearPlaylistFavoriteStore();
  });

  it("shares one in-flight request between Library surfaces", async () => {
    api.get.mockResolvedValueOnce({
      data: { resources: [{ resourceType: "albums", resourceId: "a1" }] },
    });

    await expect(
      Promise.all([getLibraryMediaCards(), getLibraryMediaCards()]),
    ).resolves.toEqual([
      [{ resourceType: "albums", resourceId: "a1" }],
      [{ resourceType: "albums", resourceId: "a1" }],
    ]);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith("/songs/library/media-cards");
  });

  it("invalidates media cards when a Library mutation is published", async () => {
    api.get
      .mockResolvedValueOnce({
        data: { resources: [{ resourceType: "albums", resourceId: "a1" }] },
      })
      .mockResolvedValueOnce({
        data: { resources: [{ resourceType: "albums", resourceId: "a2" }] },
      });

    await getLibraryMediaCards();
    refreshLibraryResources({
      resourceType: "albums",
      resourceId: "a1",
      operation: "remove",
    });

    await expect(getLibraryMediaCards()).resolves.toEqual([
      { resourceType: "albums", resourceId: "a2" },
    ]);
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});

describe("optimistic Library membership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLibraryResourcesCache();
  });

  it("removes and restores only the favourite belonging to the deleted album during Undo", async () => {
    clearFavoriteStore();
    const copies = ["large", "single"].map((albumId) => ({
      id: "b",
      albumId,
      title: "B",
    }));
    const resources = [
      { resourceType: "albums", resourceId: "large" },
      { resourceType: "albums", resourceId: "single" },
      { resourceType: "songs", resourceId: "b", sourceAlbumId: "large" },
      { resourceType: "songs", resourceId: "b", sourceAlbumId: "single" },
    ];
    api.get.mockImplementation((url: string) =>
      Promise.resolve({
        data:
          url === "/songs/library/resources"
            ? { resources }
            : url === "/songs/favorites"
              ? { songs: copies, hasMore: false }
              : { videos: [], isFavorite: false },
      }),
    );
    usePlaylistFavoriteStore.setState({ loaded: true });
    await useFavoriteStore.getState().hydrate(true);
    const removal = await beginLibraryResourceRemoval({
      resourceType: "albums",
      resourceId: "single",
    });
    expect(
      useFavoriteStore.getState().songs.map((song) => song.albumId),
    ).toEqual(["large"]);
    removal.undo();
    expect(
      useFavoriteStore
        .getState()
        .songs.map((song) => song.albumId)
        .sort(),
    ).toEqual(["large", "single"]);
    clearFavoriteStore();
  });

  it("saves and rolls back the same recording independently in another release", async () => {
    api.get.mockResolvedValueOnce({
      data: {
        resources: [
          { resourceType: "albums", resourceId: "large" },
          { resourceType: "songs", resourceId: "b", sourceAlbumId: "large" },
        ],
      },
    });
    await getLibraryResources();
    expect(isLibraryResource("songs", "b", "single")).toBe(false);
    const added = optimisticallyAddLibraryResource({
      resourceType: "albums",
      resourceId: "single",
      songIds: ["b"],
    });
    expect(isLibraryResource("songs", "b", "large")).toBe(true);
    expect(isLibraryResource("songs", "b", "single")).toBe(true);
    rollbackOptimisticLibraryAddition(added);
    expect(isLibraryResource("songs", "b", "large")).toBe(true);
    expect(isLibraryResource("songs", "b", "single")).toBe(false);
  });

  it.each(["songs", "albums"] as const)(
    "deleting %s in one release keeps another copy visible through Undo",
    async (resourceType) => {
      const resources = [
        { resourceType: "albums", resourceId: "large" },
        { resourceType: "albums", resourceId: "single" },
        { resourceType: "songs", resourceId: "b", sourceAlbumId: "large" },
        { resourceType: "songs", resourceId: "b", sourceAlbumId: "single" },
      ];
      api.get.mockImplementation((url: string) =>
        Promise.resolve({
          data:
            url === "/songs/library/resources"
              ? { resources }
              : { videos: [], isFavorite: false },
        }),
      );
      useFavoriteStore.setState({ loaded: true });
      usePlaylistFavoriteStore.setState({ loaded: true });
      await getLibraryResources();
      const removal = await beginLibraryResourceRemoval({
        resourceType,
        resourceId: resourceType === "songs" ? "b" : "single",
        sourceAlbumId: "single",
      });
      expect(isLibraryResourcePendingRemoval("songs", "b", "single")).toBe(
        true,
      );
      expect(isLibraryResourcePendingRemoval("songs", "b", "large")).toBe(
        false,
      );
      expect(isLibraryResource("songs", "b", "large")).toBe(true);
      expect(isLibraryResource("songs", "b", "single")).toBe(false);
      removal.undo();
      expect(isLibraryResource("songs", "b", "single")).toBe(true);
      expect(isLibraryResource("songs", "b", "large")).toBe(true);
    },
  );

  it("does not release a newer in-flight request when an invalidated request finishes", async () => {
    type Response = { data: { resources: [] } };
    const old = Promise.withResolvers<Response>();
    const current = Promise.withResolvers<Response>();
    api.get.mockReturnValueOnce(old.promise).mockReturnValue(current.promise);
    const firstRead = getLibraryResources();
    refreshLibraryResources({
      resourceType: "albums",
      resourceId: "album-1",
      operation: "sync",
    });
    const secondRead = getLibraryResources();
    old.resolve({ data: { resources: [] } });
    await firstRead;
    const sharedRead = getLibraryResources();
    expect(api.get).toHaveBeenCalledTimes(2);
    current.resolve({ data: { resources: [] } });
    await Promise.all([secondRead, sharedRead]);
    api.get.mockReset();
  });

  it("makes a favourited album complete immediately", async () => {
    api.get.mockResolvedValueOnce({ data: { resources: [] } });
    await getLibraryResources();

    const added = optimisticallyAddLibraryResource({
      resourceType: "albums",
      resourceId: "album-1",
      sourceOrigin: "catalog",
      songIds: ["song-1", "song-2"],
    });

    expect(
      hasLibraryResourceMembership({
        resourceType: "albums",
        resourceId: "album-1",
        songIds: ["song-1", "song-2"],
      }),
    ).toBe(true);

    rollbackOptimisticLibraryAddition(added);

    expect(
      hasLibraryResourceMembership({
        resourceType: "albums",
        resourceId: "album-1",
        songIds: ["song-1", "song-2"],
      }),
    ).toBe(false);
  });

  it("rolls back only the memberships created by the failed action", async () => {
    api.get.mockResolvedValueOnce({
      data: {
        resources: [
          { resourceType: "albums", resourceId: "album-1" },
          {
            resourceType: "songs",
            resourceId: "song-1",
            sourceAlbumId: "album-1",
          },
        ],
      },
    });
    await getLibraryResources();

    const added = optimisticallyAddLibraryResource({
      resourceType: "albums",
      resourceId: "album-1",
      sourceOrigin: "catalog",
      songIds: ["song-1", "song-2"],
    });
    rollbackOptimisticLibraryAddition(added);

    expect(
      hasLibraryResourceMembership({
        resourceType: "albums",
        resourceId: "album-1",
        songIds: ["song-1"],
      }),
    ).toBe(true);
    expect(
      hasLibraryResourceMembership({
        resourceType: "albums",
        resourceId: "album-1",
        songIds: ["song-1", "song-2"],
      }),
    ).toBe(false);
  });

  it("does not call a public album saved when its tracklist is unavailable", async () => {
    api.get.mockResolvedValueOnce({
      data: {
        resources: [{ resourceType: "albums", resourceId: "album-1" }],
      },
    });
    await getLibraryResources();

    expect(
      hasLibraryResourceMembership({
        resourceType: "albums",
        resourceId: "album-1",
      }),
    ).toBe(false);
    expect(
      hasLibraryResourceMembership({
        resourceType: "albums",
        resourceId: "album-1",
        isLibraryAlbumView: true,
      }),
    ).toBe(true);
  });

  it("keeps an optimistic favourite complete through a stale Library response", async () => {
    api.get
      .mockResolvedValueOnce({ data: { resources: [] } })
      .mockResolvedValueOnce({ data: { resources: [] } });
    await getLibraryResources();
    optimisticallyAddLibraryResource({
      resourceType: "albums",
      resourceId: "album-1",
      sourceOrigin: "catalog",
      songIds: ["song-1", "song-2"],
    });

    refreshLibraryResources({
      resourceType: "albums",
      resourceId: "album-1",
      operation: "sync",
    });
    await getLibraryResources();

    expect(
      hasLibraryResourceMembership({
        resourceType: "albums",
        resourceId: "album-1",
        songIds: ["song-1", "song-2"],
      }),
    ).toBe(true);
  });

  it("cancels a pending Library removal when the item is favourited", async () => {
    api.get.mockResolvedValue({
      data: {
        resources: [{ resourceType: "playlists", resourceId: "playlist-1" }],
      },
    });
    await getLibraryResources();
    const removal = await beginLibraryResourceRemoval({
      resourceType: "playlists",
      resourceId: "playlist-1",
      sourceOrigin: "catalog",
    });

    optimisticallyAddLibraryResource({
      resourceType: "playlists",
      resourceId: "playlist-1",
      sourceOrigin: "catalog",
    });

    expect(
      hasLibraryResourceMembership({
        resourceType: "playlists",
        resourceId: "playlist-1",
      }),
    ).toBe(true);

    // The original deferred commit becomes a no-op after the restore.
    await expect(removal.commit()).resolves.toBeUndefined();
  });

  it("hides an empty parent Album during a Song removal Undo window", async () => {
    api.get.mockImplementation((url: string) => {
      if (url === "/songs/library/resources") {
        return Promise.resolve({
          data: {
            resources: [
              { resourceType: "albums", resourceId: "album-1" },
              {
                resourceType: "songs",
                resourceId: "song-1",
                sourceAlbumId: "album-1",
              },
            ],
          },
        });
      }
      if (url === "/catalog/vn/songs/song-1/videos") {
        return Promise.resolve({ data: { videos: [] } });
      }
      if (url === "/songs/albums/album-1/favorite") {
        return Promise.resolve({ data: { isFavorite: false } });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    useFavoriteStore.setState({ loaded: true });
    usePlaylistFavoriteStore.setState({ loaded: true });

    await getLibraryResources();
    const removal = await beginLibraryResourceRemoval({
      resourceType: "songs",
      resourceId: "song-1",
      sourceAlbumId: "album-1",
    });

    expect(isLibraryResourcePendingRemoval("songs", "song-1", "album-1")).toBe(
      true,
    );
    expect(isLibraryResourcePendingRemoval("albums", "album-1")).toBe(true);
    expect(removal.removedEmptyAlbumId).toBe("album-1");

    removal.undo();

    expect(isLibraryResourcePendingRemoval("songs", "song-1", "album-1")).toBe(
      false,
    );
    expect(isLibraryResourcePendingRemoval("albums", "album-1")).toBe(false);
  });
});

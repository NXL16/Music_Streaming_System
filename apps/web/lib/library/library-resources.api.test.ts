import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/http", () => ({ http: api }));

import {
  beginLibraryResourceRemoval,
  clearLibraryResourcesCache,
  getLibraryMediaCards,
  getLibraryResources,
  hasLibraryResourceMembership,
  isLibraryResourcePendingRemoval,
  optimisticallyAddLibraryResource,
  refreshLibraryResources,
  rollbackOptimisticLibraryAddition,
} from "./library-resources.api";
import { clearFavoriteStore, useFavoriteStore } from "@/lib/favorites/use-favorite-store";
import {
  clearPlaylistFavoriteStore,
  usePlaylistFavoriteStore,
} from "@/lib/favorites/use-playlist-favorite-store";

describe("Library media-card cache", () => {
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

    expect(isLibraryResourcePendingRemoval("songs", "song-1")).toBe(true);
    expect(isLibraryResourcePendingRemoval("albums", "album-1")).toBe(true);
    expect(removal.removedEmptyAlbumId).toBe("album-1");

    removal.undo();

    expect(isLibraryResourcePendingRemoval("songs", "song-1")).toBe(false);
    expect(isLibraryResourcePendingRemoval("albums", "album-1")).toBe(false);
  });
});

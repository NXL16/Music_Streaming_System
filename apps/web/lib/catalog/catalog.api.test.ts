import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCachedQuerySnapshot, setCachedQuery } from "@/lib/api/query-cache";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const hydrate = vi.hoisted(() => vi.fn(<T>(response: T) => response));
const cacheConfig = vi.hoisted(() => ({ developmentCacheDisabled: false }));
const session = vi.hoisted(() => ({ userId: undefined as string | undefined }));
vi.mock("@/lib/auth/auth-store", () => ({
  useAuthStore: {
    getState: () => ({
      user: session.userId ? { userId: session.userId } : undefined,
    }),
  },
}));
vi.mock("@/lib/config/development-cache", () => cacheConfig);
vi.mock("@/lib/api/http", () => ({ http: api }));
vi.mock("./hydrate-catalog-media-entities", () => ({
  hydrateCatalogMediaEntities: hydrate,
}));
vi.mock("@/lib/media/media-entity-store", () => ({
  invalidateAllMediaEntities: vi.fn(),
}));

import {
  getCatalogAlbum,
  getCatalogArtist,
  getCatalogReleaseTrack,
  getCatalogAlbumRelated,
  getCatalogAlbumRelatedSnapshot,
  getCatalogPlaylist,
  getCatalogDetailSnapshot,
  getCatalogResources,
  getCatalogResourcesSnapshot,
  invalidateCatalogResourceCache,
  searchCatalogOverview,
  searchCatalogShelf,
  searchCatalogResults,
  getCatalogSearchOverviewSnapshot,
  getCatalogSearchPageSnapshot,
} from "./catalog.api";

describe("Catalog detail cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockReset();
    api.post.mockReset();
    cacheConfig.developmentCacheDisabled = false;
    session.userId = undefined;
    invalidateCatalogResourceCache();
  });
  afterEach(() => vi.restoreAllMocks());

  it("shares resource snapshots across caller-owned and shared loads and clears derived catalog queries", async () => {
    const resources = [{ type: "artists", id: "artist-a" }];
    const data = {
      data: [],
      resources: { albums: {}, artists: {}, songs: {}, playlists: {} },
    };
    api.post.mockResolvedValue({ data });
    await getCatalogResources(resources, new AbortController().signal);
    expect(getCatalogResourcesSnapshot(resources)).toBe(data);
    await getCatalogResources(resources);
    expect(api.post).toHaveBeenCalledTimes(1);
    setCachedQuery("catalog:artist-detail:a:true:true", "stale", 60_000);
    setCachedQuery("test:outside-catalog", "kept", 60_000);
    invalidateCatalogResourceCache();
    expect(getCatalogResourcesSnapshot(resources)).toBeUndefined();
    expect(
      getCachedQuerySnapshot("catalog:artist-detail:a:true:true"),
    ).toBeUndefined();
    expect(getCachedQuerySnapshot("test:outside-catalog")).toBe("kept");
  });

  it("exposes Artist and Song detail snapshots with separate resource identities", async () => {
    const artist = {
      data: [],
      resources: { artists: {}, albums: {}, songs: {}, playlists: {} },
    };
    const song = { ...artist };
    api.get
      .mockResolvedValueOnce({ data: artist })
      .mockResolvedValueOnce({ data: song });
    await getCatalogArtist("same-id");
    await getCatalogReleaseTrack("same-id");
    expect(getCatalogDetailSnapshot("artists", "same-id")).toBe(artist);
    expect(getCatalogDetailSnapshot("release-tracks", "same-id")).toBe(song);
    await getCatalogReleaseTrack("same-id", new AbortController().signal);
    expect(api.get).toHaveBeenCalledTimes(2);
    invalidateCatalogResourceCache();
    expect(getCatalogDetailSnapshot("artists", "same-id")).toBeUndefined();
    expect(
      getCatalogDetailSnapshot("release-tracks", "same-id"),
    ).toBeUndefined();
  });

  it("reuses Search overview and expanded pages without mixing categories, offsets or sessions", async () => {
    const resources = { albums: {}, artists: {}, playlists: {}, songs: {} };
    const overview = {
      resources,
      topResults: { data: [], hasMore: false },
      shelves: { data: [], musicVideos: [], shelfHasMore: {} },
    };
    api.get.mockResolvedValueOnce({ data: overview });
    session.userId = "user-a";
    await searchCatalogOverview(
      "Artist",
      { topLimit: 6 },
      new AbortController().signal,
    );
    expect(getCatalogSearchOverviewSnapshot("artist", { topLimit: 6 })).toBe(
      overview,
    );
    await searchCatalogOverview(
      "artist",
      { topLimit: 6 },
      new AbortController().signal,
    );
    const page = { data: [], resources, hasMore: true };
    api.get.mockResolvedValue({ data: page });
    await searchCatalogShelf("artist", "albums", { limit: 88, offset: 12 });
    expect(
      getCatalogSearchPageSnapshot("artist", {
        source: "shelf",
        shelfType: "albums",
        limit: 88,
        offset: 12,
      }),
    ).toBe(page);
    await searchCatalogShelf(
      "artist",
      "albums",
      { limit: 88, offset: 12 },
      new AbortController().signal,
    );
    await searchCatalogShelf("artist", "artists", { limit: 90, offset: 10 });
    await searchCatalogShelf("artist", "albums", { limit: 88, offset: 24 });
    await searchCatalogResults("artist", { limit: 24, offset: 6 });
    expect(api.get).toHaveBeenCalledTimes(5);
    session.userId = "user-b";
    expect(
      getCatalogSearchOverviewSnapshot("artist", { topLimit: 6 }),
    ).toBeUndefined();
    expect(
      getCatalogSearchPageSnapshot("artist", {
        source: "shelf",
        shelfType: "albums",
        limit: 88,
        offset: 12,
      }),
    ).toBeUndefined();
  });

  it("expires and invalidates Search snapshots and does not cache cancelled requests", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    const page = {
      data: [],
      resources: { albums: {}, artists: {}, playlists: {}, songs: {} },
      hasMore: false,
    };
    api.get.mockResolvedValue({ data: page });
    await searchCatalogResults("artist", { limit: 24, offset: 6 });
    now.mockReturnValue(121001);
    expect(
      getCatalogSearchPageSnapshot("artist", {
        source: "results",
        limit: 24,
        offset: 6,
      }),
    ).toBeUndefined();
    await searchCatalogResults("artist", { limit: 24, offset: 6 });
    invalidateCatalogResourceCache();
    expect(
      getCatalogSearchPageSnapshot("artist", {
        source: "results",
        limit: 24,
        offset: 6,
      }),
    ).toBeUndefined();
    let finish!: (value: { data: typeof page }) => void;
    api.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const controller = new AbortController();
    const pending = searchCatalogShelf(
      "artist",
      "albums",
      {},
      controller.signal,
    );
    const rejection = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    finish({ data: page });
    await rejection;
    expect(
      getCatalogSearchPageSnapshot("artist", {
        source: "shelf",
        shelfType: "albums",
      }),
    ).toBeUndefined();
  });

  const relatedData = {
    primaryArtistName: "Artist",
    moreBy: {
      data: [],
      resources: { albums: {}, artists: {}, songs: {}, playlists: {} },
    },
    featuredOn: {
      data: [],
      resources: { albums: {}, artists: {}, songs: {}, playlists: {} },
    },
    youMightAlsoLike: {
      data: [],
      resources: { albums: {}, artists: {}, songs: {}, playlists: {} },
    },
    moreByHasMore: false,
    featuredOnHasMore: false,
    youMightAlsoLikeHasMore: false,
    nextCursor: "",
  };

  it("reuses related shelf data on a cancellable revisit and exposes it before rendering", async () => {
    api.get.mockResolvedValue({ data: relatedData });
    const first = await getCatalogAlbumRelated(
      "a1",
      {},
      new AbortController().signal,
    );
    expect(getCatalogAlbumRelatedSnapshot("a1")).toBe(first);
    expect(
      await getCatalogAlbumRelated("a1", {}, new AbortController().signal),
    ).toBe(first);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(hydrate).toHaveBeenCalledTimes(3);
  });

  it("separates related previews, sections, pages and source songs", async () => {
    api.get.mockResolvedValue({ data: relatedData });
    const variants = [
      {},
      { section: "more-by" },
      { section: "more-by", limit: 30 },
      { section: "more-by", limit: 30, cursor: "next" },
      { sourceSongId: "s1" },
    ];
    for (const options of variants) await getCatalogAlbumRelated("a1", options);
    await getCatalogAlbumRelated("a2");
    for (const options of variants) await getCatalogAlbumRelated("a1", options);
    expect(api.get).toHaveBeenCalledTimes(6);
  });

  it("expires and invalidates related snapshots with the catalog cache", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    api.get.mockResolvedValue({ data: relatedData });
    await getCatalogAlbumRelated("a1");
    now.mockReturnValue(121001);
    expect(getCatalogAlbumRelatedSnapshot("a1")).toBeUndefined();
    await getCatalogAlbumRelated("a1");
    invalidateCatalogResourceCache();
    expect(getCatalogAlbumRelatedSnapshot("a1")).toBeUndefined();
    await getCatalogAlbumRelated("a1");
    expect(api.get).toHaveBeenCalledTimes(3);
  });

  it("does not cache or hydrate a cancelled related shelf response", async () => {
    let finish!: (value: { data: typeof relatedData }) => void;
    api.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const controller = new AbortController();
    const request = getCatalogAlbumRelated("a1", {}, controller.signal);
    const rejection = expect(request).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    finish({ data: relatedData });
    await rejection;
    expect(getCatalogAlbumRelatedSnapshot("a1")).toBeUndefined();
    expect(hydrate).not.toHaveBeenCalled();
  });

  it("deduplicates expanded shelf requests and honors cache-off mode", async () => {
    api.get.mockResolvedValue({ data: relatedData });
    await Promise.all([
      getCatalogAlbumRelated("a1"),
      getCatalogAlbumRelated("a1"),
    ]);
    expect(api.get).toHaveBeenCalledTimes(1);
    cacheConfig.developmentCacheDisabled = true;
    expect(getCatalogAlbumRelatedSnapshot("a1")).toBeUndefined();
    await getCatalogAlbumRelated("a1");
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("shares batch resources regardless of reference order and expires the shared snapshot", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    const data = relatedData.moreBy;
    api.post.mockResolvedValue({ data });
    const resources = [
      { id: "a1", type: "albums" },
      { id: "a2", type: "albums" },
    ];
    const first = await Promise.all([
      getCatalogResources(resources),
      getCatalogResources([...resources].reverse()),
    ]);
    expect(first[0]).toBe(first[1]);
    expect(await getCatalogResources(resources)).toBe(first[0]);
    expect(api.post).toHaveBeenCalledTimes(1);
    now.mockReturnValue(121001);
    await getCatalogResources(resources);
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it("aborts invalidated shared batches without hydrating their late response", async () => {
    const data = relatedData.moreBy;
    let finish!: (value: { data: typeof data }) => void;
    api.post.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const request = getCatalogResources([{ id: "a1", type: "albums" }]);
    const signal = api.post.mock.calls[0][2].signal as AbortSignal;
    invalidateCatalogResourceCache();
    expect(signal.aborted).toBe(true);
    finish({ data });
    await request;
    expect(hydrate).not.toHaveBeenCalled();
    api.post.mockResolvedValueOnce({ data });
    await getCatalogResources([{ id: "a1", type: "albums" }]);
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it("shares an identical album detail request across non-cancellable callers", async () => {
    api.get.mockResolvedValueOnce({
      data: { resources: { albums: {}, playlists: {} } },
    });

    await Promise.all([getCatalogAlbum("a1"), getCatalogAlbum("a1")]);

    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith(
      "/catalog/vn/albums/a1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("does not reuse a detail snapshot after explicit invalidation", async () => {
    api.get
      .mockResolvedValueOnce({
        data: { resources: { albums: {}, playlists: {} } },
      })
      .mockResolvedValueOnce({
        data: { resources: { albums: {}, playlists: {} } },
      });

    await getCatalogAlbum("a1");
    invalidateCatalogResourceCache();
    await getCatalogAlbum("a1");

    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("reuses completed detail data when the page supplies an AbortSignal", async () => {
    api.get.mockResolvedValueOnce({
      data: { resources: { albums: {}, playlists: {} } },
    });
    const controller = new AbortController();

    await getCatalogAlbum("a1");
    await getCatalogAlbum("a1", controller.signal);

    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("caches a successful signal-owned load for a synchronous page snapshot", async () => {
    const data = { data: [], resources: { albums: {}, playlists: {} } };
    api.get.mockResolvedValue({ data });
    const first = await getCatalogAlbum("a1", new AbortController().signal);
    expect(getCatalogDetailSnapshot("albums", "a1")).toBe(first);
    const second = await getCatalogAlbum("a1", new AbortController().signal);
    expect(second).toBe(first);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("expires snapshots using the existing TTL", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    api.get.mockResolvedValue({
      data: { data: [], resources: { albums: {}, playlists: {} } },
    });
    await getCatalogAlbum("a1", new AbortController().signal);
    now.mockReturnValue(121001);
    expect(getCatalogDetailSnapshot("albums", "a1")).toBeUndefined();
    await getCatalogAlbum("a1", new AbortController().signal);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("honors development cache-off mode for both loads and snapshots", async () => {
    cacheConfig.developmentCacheDisabled = true;
    api.get.mockResolvedValue({
      data: { data: [], resources: { albums: {}, playlists: {} } },
    });
    await getCatalogAlbum("a1", new AbortController().signal);
    expect(getCatalogDetailSnapshot("albums", "a1")).toBeUndefined();
    await getCatalogAlbum("a1", new AbortController().signal);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed request and retries the network on the next load", async () => {
    const data = { data: [], resources: { albums: {}, playlists: {} } };
    api.get
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({ data });
    await expect(
      getCatalogAlbum("a1", new AbortController().signal),
    ).rejects.toThrow("temporary failure");
    expect(getCatalogDetailSnapshot("albums", "a1")).toBeUndefined();
    await getCatalogAlbum("a1", new AbortController().signal);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("rejects an already-aborted caller even when its album is cached", async () => {
    api.get.mockResolvedValue({
      data: { data: [], resources: { albums: {}, playlists: {} } },
    });
    await getCatalogAlbum("a1");
    const controller = new AbortController();
    controller.abort();
    await expect(
      getCatalogAlbum("a1", controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("does not cache or hydrate a cancelled page request even if the transport resolves", async () => {
    const data = { data: [], resources: { albums: {}, playlists: {} } };
    let finish!: (value: { data: typeof data }) => void;
    api.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const controller = new AbortController();
    const request = getCatalogAlbum("a1", controller.signal);
    const rejected = expect(request).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    finish({ data });
    await rejected;
    expect(getCatalogDetailSnapshot("albums", "a1")).toBeUndefined();
    expect(hydrate).not.toHaveBeenCalled();
  });

  it("cancels only the owning caller while another album request can complete", async () => {
    const data = { data: [], resources: { albums: {}, playlists: {} } };
    const completions: Array<(value: { data: typeof data }) => void> = [];
    api.get.mockImplementation(
      () => new Promise((resolve) => completions.push(resolve)),
    );
    const cancelled = new AbortController();
    const request = getCatalogAlbum("a1", cancelled.signal);
    const rejection = expect(request).rejects.toMatchObject({
      name: "AbortError",
    });
    const shared = getCatalogAlbum("a1");
    const sharedSignal = api.get.mock.calls[1][1].signal as AbortSignal;
    cancelled.abort();
    expect(sharedSignal.aborted).toBe(false);
    completions[0]({ data });
    completions[1]({ data });
    await rejection;
    expect(await shared).toBe(data);
    expect(getCatalogDetailSnapshot("albums", "a1")).toBe(data);
  });

  it("does not repopulate cache from a signal-owned request after invalidation", async () => {
    const data = { data: [], resources: { albums: {}, playlists: {} } };
    let finish!: (value: { data: typeof data }) => void;
    api.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const request = getCatalogAlbum("a1", new AbortController().signal);
    invalidateCatalogResourceCache();
    finish({ data });
    await request;
    expect(getCatalogDetailSnapshot("albums", "a1")).toBeUndefined();
    expect(hydrate).not.toHaveBeenCalled();
  });

  it("caches the fully personalized playlist, including its track order", async () => {
    const root = { id: "p1", type: "playlists", href: "" };
    const playlist = {
      id: "p1",
      attributes: { playlistType: "system-personalized" },
      relationships: {},
    };
    api.get
      .mockResolvedValueOnce({
        data: {
          data: [root],
          resources: {
            playlists: { p1: playlist },
            albums: {},
            artists: {},
            songs: {},
          },
        },
      })
      .mockResolvedValueOnce({ data: { trackIds: ["s1"] } });
    api.post.mockResolvedValueOnce({
      data: {
        data: [],
        resources: { songs: { s1: { id: "s1" } }, artists: {}, albums: {} },
      },
    });
    const first = await getCatalogPlaylist("p1", new AbortController().signal);
    const second = await getCatalogPlaylist("p1", new AbortController().signal);
    expect(second).toBe(first);
    expect(
      getCatalogDetailSnapshot("playlists", "p1")?.resources.playlists.p1
        .relationships.tracks?.data[0]?.id,
    ).toBe("s1");
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("keeps playlist snapshots separate when the authenticated user changes", async () => {
    const data = {
      data: [{ id: "p1", type: "playlists" }],
      resources: {
        playlists: { p1: { attributes: { playlistType: "editorial" } } },
        albums: {},
        songs: {},
        artists: {},
      },
    };
    api.get.mockResolvedValue({ data });
    session.userId = "user-a";
    await getCatalogPlaylist("p1", new AbortController().signal);
    session.userId = "user-b";
    expect(getCatalogDetailSnapshot("playlists", "p1")).toBeUndefined();
    await getCatalogPlaylist("p1", new AbortController().signal);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("does not hydrate a cancelled resource batch used by playlist personalization", async () => {
    const data = { data: [], resources: { albums: {}, playlists: {} } };
    let finish!: (value: { data: typeof data }) => void;
    api.post.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const controller = new AbortController();
    const request = getCatalogResources(
      [{ id: "s1", type: "songs" }],
      controller.signal,
    );
    const rejection = expect(request).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    finish({ data });
    await rejection;
    expect(hydrate).not.toHaveBeenCalled();
  });

  it("ignores resource batches that resolve after session cache invalidation", async () => {
    const data = { data: [], resources: { albums: {}, playlists: {} } };
    let finish!: (value: { data: typeof data }) => void;
    api.post.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const request = getCatalogResources(
      [{ id: "s1", type: "songs" }],
      new AbortController().signal,
    );
    invalidateCatalogResourceCache();
    finish({ data });
    await request;
    expect(hydrate).not.toHaveBeenCalled();
  });

  it("aborts and ignores a shared request that resolves after invalidation", async () => {
    let resolveRequest:
      | ((value: {
          data: {
            resources: {
              albums: Record<string, never>;
              playlists: Record<string, never>;
            };
          };
        }) => void)
      | undefined;
    api.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );

    const request = getCatalogAlbum("a1");
    const signal = api.get.mock.calls[0]?.[1]?.signal as AbortSignal;
    invalidateCatalogResourceCache();

    expect(signal.aborted).toBe(true);
    resolveRequest?.({ data: { resources: { albums: {}, playlists: {} } } });
    await request;

    expect(hydrate).not.toHaveBeenCalled();
  });
});

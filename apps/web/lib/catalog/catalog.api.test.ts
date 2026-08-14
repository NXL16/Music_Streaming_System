import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api/http", () => ({ http: api }));
vi.mock("./hydrate-catalog-media-entities", () => ({
  hydrateCatalogMediaEntities: <T>(response: T) => response,
}));
vi.mock("@/lib/media/media-entity-store", () => ({
  invalidateAllMediaEntities: vi.fn(),
}));

import { getCatalogAlbum, invalidateCatalogResourceCache } from "./catalog.api";

describe("Catalog detail cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateCatalogResourceCache();
  });

  it("shares an identical album detail request across non-cancellable callers", async () => {
    api.get.mockResolvedValueOnce({
      data: { resources: { albums: {}, playlists: {} } },
    });

    await Promise.all([getCatalogAlbum("a1"), getCatalogAlbum("a1")]);

    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith("/catalog/vn/albums/a1", {
      signal: undefined,
    });
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

  it("keeps AbortSignal-owned requests isolated from shared cache entries", async () => {
    api.get
      .mockResolvedValueOnce({
        data: { resources: { albums: {}, playlists: {} } },
      })
      .mockResolvedValueOnce({
        data: { resources: { albums: {}, playlists: {} } },
      });
    const controller = new AbortController();

    await getCatalogAlbum("a1");
    await getCatalogAlbum("a1", controller.signal);

    expect(api.get).toHaveBeenCalledTimes(2);
  });
});

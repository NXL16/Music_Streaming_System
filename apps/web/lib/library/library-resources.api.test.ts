import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/http", () => ({ http: api }));

import {
  clearLibraryResourcesCache,
  getLibraryMediaCards,
  refreshLibraryResources,
} from "./library-resources.api";

describe("Library media-card cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLibraryResourcesCache();
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

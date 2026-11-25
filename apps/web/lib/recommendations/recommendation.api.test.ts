import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api/http", () => ({ http: api }));

import {
  getHomeRecommendations,
  getCachedHomeRecommendations,
  getRecommendationSection,
  invalidateHomeRecommendationsCache,
} from "./recommendation.api";

describe("recommendation section cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateHomeRecommendationsCache();
  });

  it("shares an in-flight Home prefetch and reuses its completed response", async () => {
    let finish!: (value: unknown) => void;
    api.get.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const prefetch = getHomeRecommendations();
    const mountedHome = getHomeRecommendations();
    expect(api.get).toHaveBeenCalledTimes(1);
    const response = { data: [] };
    finish({ data: response });
    await Promise.all([prefetch, mountedHome]);
    await expect(getHomeRecommendations()).resolves.toBe(response);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("does not let an old Home prefetch overwrite the cache after invalidation", async () => {
    let finish!: (value: unknown) => void;
    api.get.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const prefetch = getHomeRecommendations();
    invalidateHomeRecommendationsCache();
    const fresh = { data: [{ id: "current-user-home" }] };
    api.get.mockResolvedValueOnce({ data: fresh });
    await getHomeRecommendations();
    finish({ data: { data: [{ id: "old-user-home" }] } });
    await prefetch;
    expect(getCachedHomeRecommendations()).toBe(fresh);
  });

  it("coalesces and caches an identical section request", async () => {
    api.get.mockResolvedValueOnce({ data: { data: [{ id: "s1" }] } });

    await Promise.all([
      getRecommendationSection("recently-played"),
      getRecommendationSection("recently-played"),
    ]);
    await getRecommendationSection("recently-played");

    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get.mock.calls[0]?.[0]).toBe(
      "/me/recommendations/recently-played",
    );
  });

  it("does not serve a cached section after recommendation invalidation", async () => {
    api.get
      .mockResolvedValueOnce({ data: { data: [{ id: "old" }] } })
      .mockResolvedValueOnce({ data: { data: [{ id: "new" }] } });

    await getRecommendationSection("recently-played");
    invalidateHomeRecommendationsCache();
    await getRecommendationSection("recently-played");

    expect(api.get).toHaveBeenCalledTimes(2);
  });
});

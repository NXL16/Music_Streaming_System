import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api/http", () => ({ http: api }));

import {
  getRecommendationSection,
  invalidateHomeRecommendationsCache,
} from "./recommendation.api";

describe("recommendation section cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateHomeRecommendationsCache();
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

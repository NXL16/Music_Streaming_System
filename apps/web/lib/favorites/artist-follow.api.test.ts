import { beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
  });
  return {
    get: vi.fn(),
    request: vi.fn(),
    catalog: vi.fn(),
    listeners: [] as Array<
      (change: {
        artistId: string;
        isFollowed: boolean;
        pending?: boolean;
      }) => void
    >,
  };
});
vi.mock("@/lib/api/http", () => ({ http: api }));
vi.mock("@/lib/catalog/catalog.api", () => ({
  getCatalogResources: api.catalog,
}));
vi.mock("@/lib/config/development-cache", () => ({
  developmentCacheDisabled: false,
}));
vi.mock("@/lib/recommendations/home-revalidation", () => ({
  notifyHomeRecommendationsStale: vi.fn(),
}));
vi.mock("./artist-follow-events", () => ({
  subscribeArtistFollowChanges: (listener: (typeof api.listeners)[number]) => {
    api.listeners.push(listener);
    return vi.fn();
  },
  notifyArtistFollowChanged: (
    artistId: string,
    isFollowed: boolean,
    pending = false,
  ) =>
    api.listeners.forEach((listener) =>
      listener({ artistId, isFollowed, pending }),
    ),
}));
import { clearCachedQueries } from "@/lib/api/query-cache";
import {
  getArtistFollow,
  getFollowedArtists,
  getFollowedArtistsSnapshot,
  setArtistFollow,
} from "./artist-follow.api";

beforeEach(() => {
  clearCachedQueries();
  api.get.mockReset();
  api.request.mockReset();
  api.catalog.mockReset();
});

it("shares one membership request across artist cards without loading portraits", async () => {
  const response = Promise.withResolvers<{
    data: { artists: Array<{ artistId: string }> };
  }>();
  api.get.mockReturnValueOnce(response.promise);
  const cards = Promise.all(["a", "b", "c", "a"].map(getArtistFollow));
  expect(api.get).toHaveBeenCalledTimes(1);
  response.resolve({
    data: { artists: [{ artistId: "a" }, { artistId: "c" }] },
  });
  await expect(cards).resolves.toEqual([true, false, true, true]);
  await expect(getArtistFollow("a")).resolves.toBe(true);
  expect(api.get).toHaveBeenCalledTimes(1);
  expect(api.catalog).not.toHaveBeenCalled();
});

it("shares membership with Library artists and keeps followed state when an artist has no catalog projection", async () => {
  api.get.mockResolvedValueOnce({
    data: { artists: [{ artistId: "a" }, { artistId: "missing" }] },
  });
  api.catalog.mockResolvedValueOnce({
    resources: {
      artists: { a: { id: "a", attributes: { name: "A", url: "a" } } },
    },
  });
  const [followed, cards] = await Promise.all([
    getArtistFollow("missing"),
    getFollowedArtists(),
  ]);
  expect(followed).toBe(true);
  expect(cards.map((artist) => artist.id)).toEqual(["a"]);
  expect(api.get).toHaveBeenCalledTimes(1);
});

it("reloads shared membership and Library metadata after a follow mutation commits", async () => {
  api.get
    .mockResolvedValueOnce({ data: { artists: [{ artistId: "a" }] } })
    .mockResolvedValueOnce({ data: { artists: [] } });
  api.catalog.mockResolvedValueOnce({
    resources: {
      artists: { a: { id: "a", attributes: { name: "A", url: "a" } } },
    },
  });
  await getFollowedArtists();
  expect(getFollowedArtistsSnapshot()?.map((artist) => artist.id)).toEqual([
    "a",
  ]);
  api.request.mockResolvedValueOnce({ data: { isFollowed: false } });
  await setArtistFollow("a", false);
  expect(getFollowedArtistsSnapshot()).toBeUndefined();
  await expect(getArtistFollow("a")).resolves.toBe(false);
  await expect(getFollowedArtists()).resolves.toEqual([]);
  expect(api.get).toHaveBeenCalledTimes(2);
});

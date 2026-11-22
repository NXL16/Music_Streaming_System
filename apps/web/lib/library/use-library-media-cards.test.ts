import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const cache = vi.hoisted(() => ({ cards: vi.fn(), artists: vi.fn() }));
vi.mock("./library-resources.api", () => ({
  getLibraryMediaCardsSnapshot: cache.cards,
  getLibraryMediaCards: vi.fn(),
}));
vi.mock("./use-library-resources-revision", () => ({
  useLibraryResourcesRevision: () => 0,
}));
vi.mock("@/lib/favorites/ensure-favorite-library-resource", () => ({
  ensureFavoriteLibraryResource: vi.fn(),
}));
vi.mock("@/lib/favorites/artist-follow.api", () => ({
  getFollowedArtistsSnapshot: cache.artists,
  getFollowedArtists: vi.fn(),
}));
vi.mock("@/lib/favorites/artist-follow-events", () => ({
  subscribeArtistFollowChanges: vi.fn(),
}));
import { useLibraryMediaCards } from "./use-library-media-cards";

function Probe({ includeArtists = false, userId = "u1" }) {
  const result = useLibraryMediaCards({
    userId,
    includeArtists,
    errorMessage: "Failed",
  });
  return JSON.stringify({
    loading: result.loading,
    count: result.resources.length,
    artists: result.followedArtists.length,
  });
}
const render = (props = {}) =>
  renderToString(createElement(Probe, props)).replaceAll("&quot;", '"');
beforeEach(() => {
  cache.cards.mockReset();
  cache.artists.mockReset();
});

it("renders cached Library cards and empty collections without a loading frame", () => {
  expect(render()).toContain('"loading":true');
  cache.cards.mockReturnValue([]);
  expect(render()).toContain('"loading":false');
  cache.cards.mockReturnValue([{ resourceId: "album-a" }]);
  expect(render()).toContain('"count":1');
  expect(render()).toContain('"loading":false');
});

it("restores artists only when both album and followed-artist snapshots are available", () => {
  cache.cards.mockReturnValue([{ resourceId: "album-a" }]);
  expect(render({ includeArtists: true })).toContain('"loading":true');
  cache.artists.mockReturnValue([{ id: "artist-a" }]);
  expect(render({ includeArtists: true })).toContain('"loading":false');
  expect(render({ includeArtists: true })).toContain('"artists":1');
});

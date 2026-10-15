import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  getCatalogPlaylist: vi.fn(),
  getCatalogResources: vi.fn(),
  mapCatalogTracks: vi.fn(),
  recordPlay: vi.fn(),
  setQueue: vi.fn(),
}));

vi.mock("./catalog.api", () => ({
  getCatalogPlaylist: dependencies.getCatalogPlaylist,
  getCatalogResources: dependencies.getCatalogResources,
}));
vi.mock("./catalog.mapper", () => ({
  catalogArtworkSrcSet: vi.fn(),
  catalogArtworkUrl: vi.fn(),
  mapCatalogTracks: dependencies.mapCatalogTracks,
}));
vi.mock("@/lib/player/use-player-store", () => ({
  usePlayerStore: { getState: () => ({ setQueue: dependencies.setQueue }) },
}));
vi.mock("@/lib/recommendations/recommendation.api", () => ({
  recordPlayFromRecommendationOpen: dependencies.recordPlay,
}));
vi.mock("@/lib/player/playlist-playback-source", () => ({
  withPlaylistPlaybackSource: vi.fn(),
}));

import { playCatalogResource } from "./play-catalog-resource";

describe("playCatalogResource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.getCatalogResources.mockResolvedValue({});
    dependencies.mapCatalogTracks.mockReturnValue([
      { id: "song-1", playbackUrl: "https://example.test/song.m3u8" },
    ]);
  });

  it("loads an album queue through the lightweight resource batch", async () => {
    await expect(playCatalogResource("albums", "album-1")).resolves.toBe(true);

    expect(dependencies.getCatalogResources).toHaveBeenCalledWith([
      { id: "album-1", type: "albums" },
    ]);
    expect(dependencies.getCatalogPlaylist).not.toHaveBeenCalled();
    expect(dependencies.setQueue).toHaveBeenCalledWith([
      { id: "song-1", playbackUrl: "https://example.test/song.m3u8" },
    ]);
  });
});

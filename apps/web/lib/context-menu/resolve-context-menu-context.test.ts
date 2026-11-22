import { beforeEach, describe, expect, it, vi } from "vitest";
import { librarySongKey } from "@/lib/library/library-song-key";

const mocks = vi.hoisted(() => ({
  library: vi.fn(),
  snapshot: vi.fn(),
  membership: vi.fn(),
  saved: vi.fn(),
  pinned: vi.fn(),
  resources: vi.fn(),
  release: vi.fn(),
  tracks: vi.fn(),
  albumFavorite: vi.fn(),
  suggestLess: vi.fn(),
  isSuggestLess: vi.fn(),
  albumState: {
    loaded: true,
    resolvedAlbumIds: new Set<string>(),
    albumIds: new Set<string>(),
  },
  playlistState: {
    loaded: true,
    resolvedPlaylistIds: new Set<string>(),
    playlistIds: new Set<string>(),
    hydrate: vi.fn(),
  },
  songState: { songKeys: new Set<string>(), hydrate: vi.fn() },
}));

vi.mock("@/lib/library/library-resources.api", () => ({
  getLibraryResources: mocks.library,
  getLibraryResourcesSnapshot: mocks.snapshot,
  hasLibraryResourceMembership: mocks.membership,
  isLibraryResource: mocks.saved,
  isLibraryResourcePinned: mocks.pinned,
}));
vi.mock("@/lib/catalog/catalog.api", () => ({
  getCatalogResources: mocks.resources,
  getCatalogReleaseTrack: mocks.release,
}));
vi.mock("@/lib/catalog/catalog.mapper", () => ({
  mapCatalogTracks: mocks.tracks,
}));
vi.mock("@/lib/favorites/album-favorite.api", () => ({
  getAlbumFavorite: mocks.albumFavorite,
}));
vi.mock("@/lib/favorites/use-album-favorite-store", () => ({
  useAlbumFavoriteStore: { getState: () => mocks.albumState },
}));
vi.mock("@/lib/favorites/use-playlist-favorite-store", () => ({
  usePlaylistFavoriteStore: { getState: () => mocks.playlistState },
}));
vi.mock("@/lib/favorites/use-favorite-store", () => ({
  useFavoriteStore: { getState: () => mocks.songState },
}));
vi.mock("@/lib/recommendations/suggest-less.api", () => ({
  hydrateSuggestLess: mocks.suggestLess,
  isSuggestLessActive: mocks.isSuggestLess,
}));

import { resolveContextMenuContext } from "./resolve-context-menu-context";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.snapshot.mockReturnValue([]);
  mocks.library.mockResolvedValue([]);
  mocks.resources.mockResolvedValue({});
  mocks.release.mockResolvedValue({});
  mocks.tracks.mockReturnValue([
    { id: "s1", albumId: "a1", albumUrl: "/album/a/a1" },
    { id: "s2", albumId: "a1" },
  ]);
  mocks.membership.mockReturnValue(true);
  mocks.saved.mockReturnValue(false);
  mocks.pinned.mockReturnValue(false);
  mocks.suggestLess.mockResolvedValue(undefined);
  mocks.isSuggestLess.mockReturnValue(false);
  mocks.albumState.loaded = true;
  mocks.albumState.albumIds = new Set(["a1"]);
  mocks.playlistState.loaded = true;
  mocks.playlistState.playlistIds = new Set(["p1"]);
  mocks.songState.songKeys = new Set([librarySongKey("s1", "a1")]);
  mocks.songState.hydrate.mockResolvedValue(undefined);
});

describe("context menu state resolution", () => {
  it("resolves lightweight album cards against their full tracklist without mutating the input", async () => {
    const context = {
      kind: "collection",
      resourceType: "albums",
      sourceOrigin: "catalog",
      resourceId: "a1",
      title: "Album",
    } as const;
    const resolved = await resolveContextMenuContext(context);
    expect(resolved).toMatchObject({
      songIds: ["s1", "s2"],
      inLibrary: true,
      isFavorite: true,
      trackSources: [
        { songId: "s1", sourceAlbumId: "a1" },
        { songId: "s2", sourceAlbumId: "a1" },
      ],
    });
    expect(mocks.membership).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: "a1", songIds: ["s1", "s2"] }),
    );
    expect(context).not.toHaveProperty("songIds");
    expect(mocks.library).not.toHaveBeenCalled();
  });

  it("keeps Library actions usable when optional preference and catalog lookups fail", async () => {
    mocks.snapshot.mockReturnValue(undefined);
    mocks.suggestLess.mockRejectedValueOnce(
      new Error("preference unavailable"),
    );
    mocks.resources.mockRejectedValueOnce(new Error("catalog unavailable"));
    const resolved = await resolveContextMenuContext({
      kind: "collection",
      resourceType: "albums",
      sourceOrigin: "catalog",
      resourceId: "a1",
      title: "Album",
    });
    expect(resolved).toMatchObject({ inLibrary: true, isFavorite: true });
    expect(mocks.library).toHaveBeenCalledOnce();
    expect(mocks.membership).toHaveBeenCalledOnce();
  });

  it("uses a video's release album for its favourite identity", async () => {
    const resolved = await resolveContextMenuContext({
      kind: "video",
      videoId: "v1",
      songId: "s1",
      releaseTrackId: "r1",
      title: "Video",
      href: "/music-video/v/v1",
    });
    expect(mocks.release).toHaveBeenCalledWith("r1");
    expect(resolved).toMatchObject({
      kind: "video",
      sourceAlbumId: "a1",
      albumHref: "/album/a/a1",
      isFavorite: true,
    });
  });

  it("hydrates unresolved playlist favourites before building the menu", async () => {
    mocks.playlistState.loaded = false;
    mocks.playlistState.hydrate.mockResolvedValue(undefined);
    const resolved = await resolveContextMenuContext({
      kind: "collection",
      resourceType: "playlists",
      sourceOrigin: "catalog",
      resourceId: "p1",
      title: "Playlist",
    });
    expect(mocks.playlistState.hydrate).toHaveBeenCalledOnce();
    expect(resolved).toMatchObject({ inLibrary: true, isFavorite: true });
    expect(mocks.resources).not.toHaveBeenCalled();
  });

  it("preserves fallback song actions when favourite hydration fails", async () => {
    mocks.songState.hydrate.mockRejectedValueOnce(
      new Error("favourites unavailable"),
    );
    const resolved = await resolveContextMenuContext({
      kind: "song",
      songId: "s1",
      sourceAlbumId: "a1",
      title: "Song",
      isFavorite: true,
    });
    expect(resolved).toMatchObject({
      inLibrary: false,
      isFavorite: true,
      sourceAlbumId: "a1",
    });
  });

  it("leaves artist contexts and explicit menu items alone", async () => {
    const artist = {
      kind: "artist",
      artistId: "artist-1",
      title: "Artist",
      href: "/artist/a/artist-1",
    } as const;
    expect(await resolveContextMenuContext(artist)).toBe(artist);
    expect(await resolveContextMenuContext(undefined)).toBeUndefined();
    expect(mocks.suggestLess).not.toHaveBeenCalled();
    expect(mocks.library).not.toHaveBeenCalled();
  });
});

import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { AxiosError } from "axios";
import { beforeEach, expect, it, vi } from "vitest";
import {
  clearCachedQueries,
  invalidateCachedQueries,
} from "@/lib/api/query-cache";

const api = vi.hoisted(() => ({
  catalog: vi.fn(),
  library: vi.fn(),
  mediaSnapshot: vi.fn(),
  playlist: vi.fn(),
  tracks: vi.fn(),
  load: undefined as (() => Promise<unknown>) | undefined,
  loadMore: undefined as (() => Promise<void>) | undefined,
}));
vi.mock("@/lib/api/use-async-resource", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/api/use-async-resource")>();
  return {
    useAsyncResource: (
      ...args: Parameters<typeof original.useAsyncResource>
    ) => {
      api.load = args[0];
      return original.useAsyncResource(...args);
    },
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/lib/auth/auth-store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { userId: "u1" } }),
}));
vi.mock("@/lib/favorites/use-favorite-store", () => ({
  useFavoriteStore: (selector: (state: unknown) => unknown) =>
    selector({ songs: [], loaded: true, loading: false, hydrate: vi.fn() }),
}));
vi.mock("@/lib/library/library-resources.api", () => ({
  getLibraryResources: api.library,
  getLibraryMediaCardsSnapshot: api.mediaSnapshot,
  subscribeLibraryResourcesChanged: vi.fn(),
}));
vi.mock("@/lib/catalog/catalog.api", () => ({
  getCatalogPlaylist: api.catalog,
}));
vi.mock("@/lib/catalog/catalog.mapper", () => ({
  mapCatalogTracks: () => [{ id: "public-song" }],
}));
vi.mock("@/lib/playlists/user-playlists.api", () => ({
  getUserPlaylist: api.playlist,
  listUserPlaylistTracks: api.tracks,
  getAllUserPlaylistTracks: vi.fn(),
}));
vi.mock("@/lib/pagination/use-infinite-scroll-sentinel", () => ({
  useInfiniteScrollLoadMore: (options: { onLoadMore: () => Promise<void> }) => {
    api.loadMore = options.onLoadMore;
    return { sentinelRef: vi.fn(), showLoadingMore: false };
  },
}));
vi.mock("@/components/catalog/playlist-detail-view", () => ({
  default: ({
    playlist,
  }: {
    playlist: { playlistKind: string; tracks: unknown[] };
  }) => `${playlist.playlistKind}:${playlist.tracks.length}`,
}));
vi.mock("@/components/loading/catalog-page-loading", () => ({
  default: () => "loading",
}));
vi.mock("@/components/states/not-found-state", () => ({
  NotFoundState: () => "not-found",
}));
vi.mock("@/components/states/request-error-state", () => ({
  RequestErrorState: () => "error",
}));
vi.mock("@/lib/songs/project-song-summary", () => ({
  projectSongSummary: (song: unknown) => song,
}));

import Page from "./page";

function mount(playlistId = "p1") {
  const value = { playlistId };
  const params = Object.assign(Promise.resolve(value), {
    status: "fulfilled",
    value,
  });
  return renderToString(createElement(Page, { params }));
}
function privatePlaylist() {
  api.catalog.mockRejectedValue(
    new AxiosError("Not found", "404", undefined, undefined, {
      status: 404,
    } as never),
  );
}
beforeEach(() => {
  clearCachedQueries();
  vi.clearAllMocks();
  api.mediaSnapshot.mockReturnValue(undefined);
  api.library.mockResolvedValue([
    { resourceType: "playlists", resourceId: "p1" },
  ]);
  api.catalog.mockResolvedValue({
    data: [{ type: "playlists", id: "p1" }],
    resources: {
      playlists: { p1: { attributes: { name: "Public playlist" } } },
    },
  });
  api.playlist.mockResolvedValue({ id: "p1", name: "Private playlist" });
  api.tracks.mockImplementation(
    async (_id: string, options?: { cursor?: string }) => ({
      songs: [{ id: options?.cursor ? "s2" : "s1" }],
      nextCursor: options?.cursor ? "" : "next",
      hasMore: !options?.cursor,
    }),
  );
});

it("restores a system/catalog Library playlist without loading or falling back to a private playlist", async () => {
  expect(mount()).toBe("loading");
  await api.load!();
  expect(mount()).toBe("catalog:1");
  expect(api.catalog).toHaveBeenCalledTimes(1);
  expect(api.playlist).not.toHaveBeenCalled();
  expect(api.tracks).not.toHaveBeenCalled();
});

it("restores a private Library playlist with all loaded tracks and its completed cursor", async () => {
  privatePlaylist();
  mount();
  await api.load!();
  expect(mount()).toBe("user:1");
  await api.loadMore!();
  expect(mount()).toBe("user:2");
  await api.loadMore!();
  expect(api.playlist).toHaveBeenCalledTimes(1);
  expect(api.tracks).toHaveBeenCalledTimes(2);
  invalidateCachedQueries("library:playlist-detail:p1:");
  expect(mount()).toBe("loading");
});

it("does not restore a removed playlist or share another playlist's cache", async () => {
  mount();
  await api.load!();
  expect(mount("p2")).toBe("loading");
  invalidateCachedQueries("library:playlist-detail:p1:");
  api.library.mockResolvedValue([]);
  mount();
  await api.load!();
  expect(mount()).toBe("not-found");
  expect(api.catalog).toHaveBeenCalledTimes(1);
});

it("opens a known private playlist without a catalog request and restores its cache", async () => {
  api.mediaSnapshot.mockReturnValue([
    {
      resourceType: "playlists",
      resourceId: "p1",
      catalogUrl: "/library/playlist/p1",
    },
  ]);
  mount();
  await api.load!();
  expect(mount()).toBe("user:1");
  expect(api.catalog).not.toHaveBeenCalled();
  expect(api.playlist).toHaveBeenCalledTimes(1);
  expect(api.tracks).toHaveBeenCalledTimes(1);
});

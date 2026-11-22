import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { clearCachedQueries } from "@/lib/api/query-cache";

const api = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("./user-playlists.api", () => ({
  listUserPlaylists: api.list,
}));
vi.mock("@/lib/library/library-resources.api", () => ({
  subscribeLibraryResourcesChanged: vi.fn(),
}));
import { useUserPlaylistPages } from "./use-user-playlist-pages";

type Result = ReturnType<typeof useUserPlaylistPages>;
function Probe({
  userId,
  onRender,
}: {
  userId: string;
  onRender: (result: Result) => void;
}) {
  onRender(useUserPlaylistPages(userId));
  return null;
}
function mount(userId = "u1") {
  const onRender = vi.fn<(result: Result) => void>();
  renderToString(createElement(Probe, { userId, onRender }));
  return onRender.mock.calls[0][0];
}
beforeEach(() => {
  clearCachedQueries();
  api.list.mockReset();
  api.list.mockImplementation(
    async (userId: string, { cursor }: { cursor?: string }) => ({
      playlists: [{ id: userId + (cursor ?? "first") }],
      hasMore: !cursor,
      nextCursor: cursor ? "" : "next",
    }),
  );
});

it("restores loaded playlist pages without loading and does not repeat the last cursor", async () => {
  expect(mount().isLoading).toBe(true);
  await mount().reload();
  await mount().loadMore();
  const restored = mount();
  expect(restored.isLoading).toBe(false);
  expect(restored.playlists.map((playlist) => playlist.id)).toEqual([
    "u1first",
    "u1next",
  ]);
  expect(restored.hasMore).toBe(false);
  await restored.loadMore();
  expect(api.list).toHaveBeenCalledTimes(2);
  expect(mount("u2").playlists).toEqual([]);
});

it("preserves successful pages after an error and resets them on explicit reload", async () => {
  await mount().reload();
  api.list.mockRejectedValueOnce(new Error("temporary"));
  await mount().loadMore();
  expect(mount().playlists).toHaveLength(1);
  expect(mount().hasMore).toBe(true);
  await mount().loadMore();
  expect(mount().playlists).toHaveLength(2);
  await mount().reload();
  expect(mount().playlists).toHaveLength(1);
  clearCachedQueries();
  expect(mount().isLoading).toBe(true);
});

it("does not append an old cursor while the first page is being refreshed", async () => {
  await mount().reload();
  let finish!: (page: {
    playlists: { id: string }[];
    hasMore: boolean;
    nextCursor: string;
  }) => void;
  api.list.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const current = mount();
  const refreshing = current.reload();
  await current.loadMore();
  expect(api.list).toHaveBeenCalledTimes(2);
  finish({ playlists: [{ id: "fresh" }], hasMore: false, nextCursor: "" });
  await refreshing;
  expect(mount().playlists.map((playlist) => playlist.id)).toEqual(["fresh"]);
});

import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearCachedQueries } from "@/lib/api/query-cache";

const api = vi.hoisted(() => ({ songs: vi.fn() }));
vi.mock("./catalog.api", () => ({ getCatalogArtistSongs: api.songs }));
vi.mock("./catalog.mapper", () => ({
  mapCatalogTracks: (page: { songs: unknown[] }) => page.songs,
}));

import {
  getCatalogArtistSongPage,
  invalidateCatalogArtistSongPages,
} from "./artist-song-pages";
import { useCatalogArtistSongs } from "./use-catalog-artist-songs";

function Probe({
  artistId,
  onRender,
}: {
  artistId: string;
  onRender: (result: ReturnType<typeof useCatalogArtistSongs>) => void;
}) {
  onRender(useCatalogArtistSongs(artistId));
  return null;
}
function mount(artistId = "artist-a") {
  const onRender =
    vi.fn<(result: ReturnType<typeof useCatalogArtistSongs>) => void>();
  renderToString(createElement(Probe, { artistId, onRender }));
  return onRender.mock.calls[0][0];
}

beforeEach(() => {
  clearCachedQueries();
  api.songs.mockReset();
  api.songs.mockImplementation(
    async (_id: string, { cursor }: { cursor?: string }) => {
      if (!cursor) return { songs: [{ id: "s1" }], nextCursor: "page-2" };
      if (cursor === "page-2")
        return { songs: [{ id: "s1" }, { id: "s2" }], nextCursor: "page-3" };
      return { songs: [{ id: "s3" }], nextCursor: "" };
    },
  );
});
afterEach(() => vi.restoreAllMocks());

it("restores all loaded songs and continues from the next cursor after remount", async () => {
  await getCatalogArtistSongPage("artist-a");
  await mount().loadMore();
  const restored = mount();
  expect(restored.loading).toBe(false);
  expect(restored.songs.map((song) => song.id)).toEqual(["s1", "s2"]);
  expect(api.songs).toHaveBeenCalledTimes(2);
  await restored.loadMore();
  expect(api.songs.mock.calls[2][1].cursor).toBe("page-3");
  const completed = mount();
  expect(completed.songs.map((song) => song.id)).toEqual(["s1", "s2", "s3"]);
  expect(completed.hasMore).toBe(false);
  await completed.loadMore();
  expect(api.songs).toHaveBeenCalledTimes(3);
});

it("keeps the last successful snapshot on failure and retries the same cursor", async () => {
  await getCatalogArtistSongPage("artist-a");
  await mount().loadMore();
  api.songs.mockRejectedValueOnce(new Error("temporary failure"));
  await mount().loadMore();
  expect(mount().songs.map((song) => song.id)).toEqual(["s1", "s2"]);
  await mount().loadMore();
  expect(api.songs.mock.calls.slice(2).map((call) => call[1].cursor)).toEqual([
    "page-3",
    "page-3",
  ]);
  expect(mount().songs).toHaveLength(3);
});

it("isolates artists and clears loaded pages on reload, expiration and session clearing", async () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(1000);
  await getCatalogArtistSongPage("artist-a");
  await mount().loadMore();
  expect(mount("artist-b").songs).toEqual([]);
  await mount().reload();
  expect(mount().songs.map((song) => song.id)).toEqual(["s1"]);
  await mount().loadMore();
  now.mockReturnValue(121001);
  expect(mount().loading).toBe(true);
  await getCatalogArtistSongPage("artist-a");
  await mount().loadMore();
  clearCachedQueries();
  expect(mount().songs).toEqual([]);
  await getCatalogArtistSongPage("artist-a");
  await mount().loadMore();
  invalidateCatalogArtistSongPages("artist-a");
  expect(mount().loading).toBe(true);
});

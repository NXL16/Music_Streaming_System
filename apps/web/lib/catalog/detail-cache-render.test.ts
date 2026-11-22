import { createElement, type ReactElement } from "react";
import { renderToString as renderHtml } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearCachedQueries } from "@/lib/api/query-cache";

const api = vi.hoisted(() => ({
  artist: vi.fn(),
  albums: vi.fn(),
  songs: vi.fn(),
  releaseTrack: vi.fn(),
  snapshot: vi.fn(),
  tracks: vi.fn(),
  load: undefined as (() => Promise<unknown>) | undefined,
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
vi.mock("./catalog.api", () => ({
  getCatalogAlbum: vi.fn(),
  getCatalogPlaylist: vi.fn(),
  getCatalogArtist: api.artist,
  getCatalogArtistAlbums: api.albums,
  getCatalogReleaseTrack: api.releaseTrack,
  getCatalogDetailSnapshot: api.snapshot,
}));
vi.mock("./artist-song-pages", () => ({
  getCatalogArtistSongPage: api.songs,
  invalidateCatalogArtistSongPages: vi.fn(),
}));
vi.mock("./catalog.mapper", () => ({ mapCatalogTracks: api.tracks }));

import { useCatalogArtist } from "./use-catalog-artist";
import { useCatalogSong } from "./use-catalog-song";

function renderToString(element: ReactElement) {
  return renderHtml(element).replaceAll("&quot;", '"');
}

function Artist({ id, minimal = false }: { id: string; minimal?: boolean }) {
  const result = useCatalogArtist(id, {
    includeAlbums: !minimal,
    includeSongs: !minimal,
  });
  return JSON.stringify({
    loading: result.loading,
    id: result.artist?.id,
    albums: result.albums.map((album) => album.id),
    songs: result.songs.map((song) => song.id),
  });
}
function Song({ id }: { id: string }) {
  const result = useCatalogSong(id);
  return JSON.stringify({
    loading: result.loading,
    release: result.song?.releaseTrackId,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  clearCachedQueries();
  api.artist.mockImplementation(async (id: string) => ({
    resources: { artists: { [id]: { id } } },
  }));
  api.albums.mockResolvedValue({
    resources: {
      albums: {
        older: { id: "older", attributes: { releaseDate: "2020-01-01" } },
        newer: { id: "newer", attributes: { releaseDate: "2026-01-01" } },
      },
      artists: {},
    },
  });
  api.songs.mockResolvedValue({ songs: [{ id: "song-a" }] });
  api.snapshot.mockReturnValue(undefined);
  api.tracks.mockReturnValue([
    { id: "song-b", releaseTrackId: "release-a" },
    { id: "song-b", releaseTrackId: "release-b" },
  ]);
});
afterEach(() => vi.restoreAllMocks());

it("renders the complete Artist snapshot immediately on remount without more requests", async () => {
  expect(renderToString(createElement(Artist, { id: "artist-a" }))).toContain(
    '"loading":true',
  );
  await api.load!();
  const remount = renderToString(createElement(Artist, { id: "artist-a" }));
  expect(remount).toContain('"loading":false');
  expect(remount).toContain('"id":"artist-a"');
  expect(remount).toContain('"songs":["song-a"]');
  expect(remount.indexOf("newer")).toBeLessThan(remount.indexOf("older"));
  expect(api.artist).toHaveBeenCalledTimes(1);
  expect(api.albums).toHaveBeenCalledTimes(3);
  expect(api.songs).toHaveBeenCalledTimes(1);
  expect(renderToString(createElement(Artist, { id: "artist-b" }))).toContain(
    '"loading":true',
  );
  expect(
    renderToString(createElement(Artist, { id: "artist-a", minimal: true })),
  ).toContain('"loading":true');
});

it("does not restore an Artist snapshot after expiration or session cache clearing", async () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(1000);
  renderToString(createElement(Artist, { id: "artist-a" }));
  await api.load!();
  now.mockReturnValue(121001);
  expect(renderToString(createElement(Artist, { id: "artist-a" }))).toContain(
    '"loading":true',
  );
  await api.load!();
  clearCachedQueries();
  expect(renderToString(createElement(Artist, { id: "artist-a" }))).toContain(
    '"loading":true',
  );
});

it("renders the matching Song release from the API snapshot without a loading frame", () => {
  expect(renderToString(createElement(Song, { id: "release-b" }))).toContain(
    '"loading":true',
  );
  api.snapshot.mockReturnValue({ resources: {} });
  expect(renderToString(createElement(Song, { id: "release-b" }))).toContain(
    '"release":"release-b"',
  );
  expect(renderToString(createElement(Song, { id: "release-b" }))).toContain(
    '"loading":false',
  );
  expect(api.snapshot).toHaveBeenCalledWith(
    "release-tracks",
    "release-b",
    null,
  );
  expect(api.releaseTrack).not.toHaveBeenCalled();
});

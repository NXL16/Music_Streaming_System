import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("@/lib/api/http", () => ({ http: api }));
const library = vi.hoisted(() => ({
  isLibraryResourcePendingRemoval: vi.fn(() => false),
  refreshLibraryResources: vi.fn(),
}));
vi.mock("@/lib/library/library-resources.api", () => library);
const playlistEvents = vi.hoisted(() => ({ notifyPlaylistChanged: vi.fn() }));
vi.mock("./playlist-events", () => playlistEvents);

import {
  addSongToUserPlaylist,
  addSourceToUserPlaylist,
  createUserPlaylistFromSource,
  getAllUserPlaylistTracks,
  getUserPlaylist,
  getUserPlaylists,
  listUserPlaylists,
  listUserPlaylistTracks,
  removeSongFromUserPlaylist,
  updateUserPlaylist,
} from "./user-playlists.api";

function song(id: string) {
  return {
    id,
    title: id,
    artist: "Artist",
    album: "Album",
    isPublic: true,
    status: 3 as const,
    durationSec: 1,
    createdAt: 0,
    coverUrl: "",
  };
}

describe("user playlist API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    library.isLibraryResourcePendingRemoval.mockReturnValue(false);
  });

  it("requests playlist metadata without the full track payload", async () => {
    api.get.mockResolvedValueOnce({
      data: { playlist: { id: "p1", name: "P" } },
    });

    await expect(getUserPlaylist("p1")).resolves.toEqual({
      id: "p1",
      name: "P",
    });
    expect(api.get).toHaveBeenCalledWith("/playlists/p1", {
      params: { includeTracks: false },
    });
  });

  it("maps a cursor page to the dedicated tracks endpoint", async () => {
    api.get.mockResolvedValueOnce({
      data: { songs: [song("one")], nextCursor: "10", hasMore: true },
    });

    await expect(
      listUserPlaylistTracks("p1", { cursor: "5", limit: 20 }),
    ).resolves.toMatchObject({
      nextCursor: "10",
      hasMore: true,
    });
    expect(api.get).toHaveBeenCalledWith("/playlists/p1/tracks", {
      params: { cursor: "5", limit: 20 },
    });
  });

  it("maps user playlist pagination to the shared cursor contract", async () => {
    api.get.mockResolvedValueOnce({
      data: {
        playlists: [{ id: "p1", name: "P" }],
        nextCursor: "100:p1",
        hasMore: true,
      },
    });

    await expect(
      listUserPlaylists("u1", { cursor: "200:p2", limit: 24 }),
    ).resolves.toMatchObject({ nextCursor: "100:p1", hasMore: true });
    expect(api.get).toHaveBeenCalledWith("/playlists/user/u1", {
      params: { cursor: "200:p2", limit: 24 },
    });
  });

  it("loads all user playlist pages for controls that require a complete choice list", async () => {
    api.get
      .mockResolvedValueOnce({
        data: {
          playlists: [
            { id: "p1", name: "One" },
            { id: "p2", name: "Two" },
          ],
          nextCursor: "100:p2",
          hasMore: true,
        },
      })
      .mockResolvedValueOnce({
        data: {
          playlists: [
            { id: "p2", name: "Two" },
            { id: "p3", name: "Three" },
          ],
          nextCursor: "",
          hasMore: false,
        },
      });

    await expect(getUserPlaylists("u1")).resolves.toMatchObject([
      { id: "p1" },
      { id: "p2" },
      { id: "p3" },
    ]);
    expect(api.get).toHaveBeenNthCalledWith(1, "/playlists/user/u1", {
      params: { cursor: undefined, limit: 50 },
      signal: expect.any(AbortSignal),
    });
    expect(api.get).toHaveBeenNthCalledWith(2, "/playlists/user/u1", {
      params: { cursor: "100:p2", limit: 50 },
      signal: expect.any(AbortSignal),
    });
  });

  it("rejects an invalid user playlist cursor rather than looping forever", async () => {
    api.get.mockResolvedValueOnce({
      data: { playlists: [], nextCursor: "", hasMore: true },
    });

    await expect(getUserPlaylists("u2")).rejects.toThrow(
      "INVALID_USER_PLAYLIST_CURSOR",
    );
  });

  it("centralizes track and source mutations with one playlist sync", async () => {
    api.post.mockResolvedValue({ data: {} });
    api.delete.mockResolvedValue({ data: {} });

    await addSongToUserPlaylist("p1", "s1", "u1");
    await addSourceToUserPlaylist("p1", {} as never, "u1");
    await removeSongFromUserPlaylist("p1", "s1", "u1");

    expect(api.post).toHaveBeenCalledWith("/playlists/p1/tracks", {
      songId: "s1",
    });
    expect(api.post).toHaveBeenCalledWith("/playlists/p1/from-source", {
      source: {},
    });
    expect(api.delete).toHaveBeenCalledWith("/playlists/p1/tracks/s1");
    expect(library.refreshLibraryResources).toHaveBeenCalledTimes(3);
    expect(playlistEvents.notifyPlaylistChanged).toHaveBeenCalledTimes(3);
  });

  it("publishes the new playlist metadata for an immediate sidebar insert", async () => {
    api.post.mockResolvedValueOnce({ data: { id: "p-new" } });

    await expect(
      createUserPlaylistFromSource({
        name: "Fresh playlist",
        description: "",
        source: {},
        userId: "u1",
      }),
    ).resolves.toEqual({ id: "p-new" });

    expect(playlistEvents.notifyPlaylistChanged).toHaveBeenCalledWith(
      "p-new",
      "u1",
      {
        operation: "create",
        playlist: { id: "p-new", name: "Fresh playlist" },
      },
    );
  });

  it("synchronizes an edited playlist after its request succeeds", async () => {
    api.patch.mockResolvedValue({ data: {} });

    await updateUserPlaylist("p1", {
      name: "Renamed",
      description: "Updated",
      userId: "u1",
    });

    expect(api.patch).toHaveBeenCalledWith("/playlists/p1", {
      name: "Renamed",
      description: "Updated",
    });
    expect(library.refreshLibraryResources).toHaveBeenCalledWith({
      resourceType: "playlists",
      resourceId: "p1",
      operation: "update",
    });
  });

  it("loads every page for playback and removes duplicate track ids", async () => {
    api.get
      .mockResolvedValueOnce({
        data: {
          songs: [song("one"), song("two")],
          nextCursor: "1",
          hasMore: true,
        },
      })
      .mockResolvedValueOnce({
        data: {
          songs: [song("two"), song("three")],
          nextCursor: "",
          hasMore: false,
        },
      });

    await expect(getAllUserPlaylistTracks("p1")).resolves.toMatchObject([
      { id: "one" },
      { id: "two" },
      { id: "three" },
    ]);
    expect(api.get).toHaveBeenNthCalledWith(1, "/playlists/p1/tracks", {
      params: { cursor: undefined, limit: 50 },
    });
    expect(api.get).toHaveBeenNthCalledWith(2, "/playlists/p1/tracks", {
      params: { cursor: "1", limit: 50 },
    });
  });

  it("rejects an empty or repeated cursor instead of looping forever", async () => {
    api.get.mockResolvedValueOnce({
      data: { songs: [song("one")], nextCursor: "", hasMore: true },
    });
    await expect(getAllUserPlaylistTracks("p1")).rejects.toThrow(
      "INVALID_PLAYLIST_TRACK_CURSOR",
    );

    api.get.mockReset();
    api.get
      .mockResolvedValueOnce({
        data: { songs: [], nextCursor: "1", hasMore: true },
      })
      .mockResolvedValueOnce({
        data: { songs: [], nextCursor: "1", hasMore: true },
      });
    await expect(getAllUserPlaylistTracks("p1")).rejects.toThrow(
      "INVALID_PLAYLIST_TRACK_CURSOR",
    );
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  resources: vi.fn(),
  cards: vi.fn().mockResolvedValue([]),
  songs: vi.fn(),
  pending: new Set<string>(),
  setQueue: vi.fn(),
  playShuffledQueue: vi.fn(),
}));
vi.mock("./library-resources.api", () => ({
  getLibraryResources: api.resources,
  getLibraryMediaCards: api.cards,
  isLibraryResourcePendingRemoval: (_type: string, id: string) =>
    api.pending.has(id),
}));
vi.mock("@/lib/songs/song.api", () => ({ getAllLibrarySongs: api.songs }));
vi.mock("@/lib/songs/project-song-summary", () => ({
  projectSongSummary: (song: unknown) => song,
}));
vi.mock("@/lib/player/use-player-store", () => ({
  usePlayerStore: {
    getState: () => ({
      setQueue: api.setQueue,
      playShuffledQueue: api.playShuffledQueue,
    }),
  },
}));
import { playLibraryAlbums } from "./play-library-albums";

describe("Library album playback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.pending.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it("plays the selected release of a shared recording and keeps both copies for a multi-album queue", async () => {
    api.resources.mockResolvedValue(
      ["large", "single"].map((sourceAlbumId) => ({
        resourceType: "songs",
        resourceId: "b",
        sourceAlbumId,
      })),
    );
    const copies = ["large", "single"].map((albumId) => ({
      id: "b",
      title: "B",
      albumId,
    }));
    api.songs.mockResolvedValue(copies);
    await playLibraryAlbums(["single"]);
    expect(api.setQueue).toHaveBeenLastCalledWith([copies[1]], 0);
    await playLibraryAlbums(["large", "single"]);
    expect(api.setQueue).toHaveBeenLastCalledWith(copies, 0);
  });

  it.each([false, true])(
    "plays saved tracks only, falling back to Play for one song (shuffle=%s)",
    async (shuffle) => {
      api.resources.mockResolvedValue([
        { resourceType: "songs", resourceId: "saved", sourceAlbumId: "album" },
        {
          resourceType: "songs",
          resourceId: "deleted",
          sourceAlbumId: "album",
        },
        {
          resourceType: "songs",
          resourceId: "other",
          sourceAlbumId: "other-album",
        },
      ]);
      api.pending.add("deleted");
      api.songs.mockResolvedValue([
        { id: "saved", title: "Saved" },
        { id: "other", title: "Other" },
      ]);
      expect(await playLibraryAlbums(["album"], { shuffle })).toBe(true);
      expect(api.setQueue).toHaveBeenCalledWith(
        [{ id: "saved", title: "Saved" }],
        0,
      );
      expect(api.playShuffledQueue).not.toHaveBeenCalled();
    },
  );

  it("starts a complete shuffled queue at index zero even when random would choose the last song", async () => {
    const { usePlayerStore } = await vi.importActual<
      typeof import("@/lib/player/use-player-store")
    >("@/lib/player/use-player-store");
    const songs = ["a", "b"].map((id) => ({
      id,
      title: id,
      artist: "Artist",
      album: "Album",
      durationSec: 1,
      artworkUrl: "",
      playbackUrl: `stream:${id}`,
    }));
    usePlayerStore.getState().clear();
    api.resources.mockResolvedValue(
      songs.map(({ id }) => ({
        resourceType: "songs",
        resourceId: id,
        sourceAlbumId: "album",
      })),
    );
    api.songs.mockResolvedValue(songs);
    api.playShuffledQueue.mockImplementationOnce(
      usePlayerStore.getState().playShuffledQueue,
    );
    vi.spyOn(Math, "random").mockReturnValue(0.999999);

    expect(await playLibraryAlbums(["album"], { shuffle: true })).toBe(true);
    expect(api.setQueue).not.toHaveBeenCalled();
    expect(usePlayerStore.getState()).toMatchObject({
      currentIndex: 0,
      shuffleEnabled: true,
      playing: true,
    });
    expect(usePlayerStore.getState().queue).toHaveLength(2);
    const firstId = usePlayerStore.getState().currentSong?.id;
    usePlayerStore.getState().next();
    expect(usePlayerStore.getState().currentSong?.id).not.toBe(firstId);
    usePlayerStore.getState().clear();
  });

  it("plays newly saved albums first, then tracks in release order instead of alphabetical order", async () => {
    api.resources.mockResolvedValue([
      { resourceType: "songs", resourceId: "new-2", sourceAlbumId: "new" },
      { resourceType: "songs", resourceId: "old-1", sourceAlbumId: "old" },
      { resourceType: "songs", resourceId: "new-1", sourceAlbumId: "new" },
    ]);
    api.cards.mockResolvedValueOnce([
      {
        resourceType: "albums",
        resourceId: "old",
        createdAt: "2025-01-01T00:00:00Z",
        songIds: ["old-1"],
      },
      {
        resourceType: "albums",
        resourceId: "new",
        createdAt: "2026-01-01T00:00:00Z",
        songIds: ["new-1", "new-2"],
      },
    ]);
    api.songs.mockResolvedValue([
      { id: "new-2", title: "A" },
      { id: "old-1", title: "B" },
      { id: "new-1", title: "Z" },
    ]);
    expect(await playLibraryAlbums(["old", "new"])).toBe(true);
    expect(
      api.setQueue.mock.calls[0][0].map((song: { id: string }) => song.id),
    ).toEqual(["new-1", "new-2", "old-1"]);
  });

  it("keeps the existing queue when selection changes during loading", async () => {
    api.resources.mockResolvedValue([
      { resourceType: "songs", resourceId: "s", sourceAlbumId: "album" },
    ]);
    let active = true;
    api.songs.mockImplementation(async () => {
      active = false;
      return [{ id: "s", title: "Song" }];
    });
    expect(
      await playLibraryAlbums(["album"], { isCurrent: () => active }),
    ).toBe(false);
    expect(api.setQueue).not.toHaveBeenCalled();
  });

  it("never loads an unfiltered Library queue for an empty group", async () => {
    api.resources.mockResolvedValue([]);
    expect(await playLibraryAlbums(["album"])).toBe(false);
    expect(api.songs).not.toHaveBeenCalled();
    expect(api.setQueue).not.toHaveBeenCalled();
  });

  it("does not play a track removed while the song request is in flight", async () => {
    api.resources.mockResolvedValue([
      { resourceType: "songs", resourceId: "s", sourceAlbumId: "album" },
    ]);
    api.songs.mockImplementation(async () => {
      api.pending.add("s");
      return [{ id: "s", title: "Song" }];
    });
    expect(await playLibraryAlbums(["album"])).toBe(false);
    expect(api.setQueue).not.toHaveBeenCalled();
  });

  it("bounds song ID queries for large groups without losing tracks", async () => {
    const songs = Array.from({ length: 205 }, (_, i) => ({
      id: `s${i}`,
      title: `Song ${i}`,
    }));
    api.resources.mockResolvedValue(
      songs.map((song) => ({
        resourceType: "songs",
        resourceId: song.id,
        sourceAlbumId: "album",
      })),
    );
    api.songs.mockImplementation(async ({ songIds }: { songIds: string[] }) =>
      songs.filter((song) => songIds.includes(song.id)),
    );
    expect(await playLibraryAlbums(["album"])).toBe(true);
    expect(
      api.songs.mock.calls.map(([params]) => params.songIds.length),
    ).toEqual([100, 100, 5]);
    expect(api.setQueue.mock.calls[0][0]).toHaveLength(205);
  });
});

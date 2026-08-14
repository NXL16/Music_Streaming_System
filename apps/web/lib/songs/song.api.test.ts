import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/http", () => ({ http: api }));

import { getAllLibrarySongs } from "./song.api";

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

describe("Library song playback pagination", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads every page in sort order and removes overlapping songs", async () => {
    api.get
      .mockResolvedValueOnce({
        data: {
          songs: [song("one"), song("two")],
          nextCursor: "cursor-two",
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

    await expect(
      getAllLibrarySongs({ sortBy: "title", direction: "ascending" }),
    ).resolves.toMatchObject([{ id: "one" }, { id: "two" }, { id: "three" }]);

    expect(api.get).toHaveBeenNthCalledWith(1, "/songs/library/songs", {
      params: {
        cursor: undefined,
        limit: 100,
        sortBy: "title",
        direction: "ascending",
        songIds: undefined,
      },
    });
    expect(api.get).toHaveBeenNthCalledWith(2, "/songs/library/songs", {
      params: {
        cursor: "cursor-two",
        limit: 100,
        sortBy: "title",
        direction: "ascending",
        songIds: undefined,
      },
    });
  });

  it("rejects an invalid cursor instead of looping forever", async () => {
    api.get.mockResolvedValueOnce({
      data: { songs: [song("one")], nextCursor: "", hasMore: true },
    });

    await expect(getAllLibrarySongs()).rejects.toThrow(
      "INVALID_LIBRARY_SONG_CURSOR",
    );
  });
});

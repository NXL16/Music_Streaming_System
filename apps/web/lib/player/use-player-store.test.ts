import { afterEach, describe, expect, it } from "vitest";
import type { PlayerSong } from "./use-player-store";
import { usePlayerStore } from "./use-player-store";

function song(id: string): PlayerSong {
  return {
    id,
    title: `Song ${id}`,
    artist: "Artist",
    album: "Album",
    durationSec: 180,
    artworkUrl: "",
    playbackUrl: `mse:${id}`,
  };
}

afterEach(() => usePlayerStore.getState().clear());

describe("player queue insertion", () => {
  it("inserts Play Next after the active track and Play Last at the end", () => {
    const player = usePlayerStore.getState();
    player.setQueue([song("a"), song("b")]);
    player.enqueue([song("c")], "next");
    player.enqueue([song("d")], "last");

    expect(usePlayerStore.getState().queue.map((item) => item.id)).toEqual([
      "a",
      "c",
      "b",
      "d",
    ]);
    expect(usePlayerStore.getState().currentSong?.id).toBe("a");
  });

  it("prepares a queue without starting playback when nothing is active", () => {
    const player = usePlayerStore.getState();
    player.enqueue([song("a"), song("b")], "next");

    expect(usePlayerStore.getState()).toMatchObject({
      currentSong: null,
      currentIndex: -1,
      playing: false,
    });
    expect(usePlayerStore.getState().queue.map((item) => item.id)).toEqual([
      "a",
      "b",
    ]);

    usePlayerStore.getState().togglePlayback();
    expect(usePlayerStore.getState()).toMatchObject({
      currentIndex: 0,
      playing: true,
    });
    expect(usePlayerStore.getState().currentSong?.id).toBe("a");
  });

  it("moves an existing queued song between Play Next and Play Last", () => {
    const player = usePlayerStore.getState();
    player.setQueue([song("a"), song("b"), song("c")]);

    player.enqueue([song("c")], "next");
    expect(usePlayerStore.getState().queue.map((item) => item.id)).toEqual([
      "a",
      "c",
      "b",
    ]);

    player.enqueue([song("c")], "last");

    expect(usePlayerStore.getState().queue.map((item) => item.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

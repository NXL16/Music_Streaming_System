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

describe("Autoplay and Repeat", () => {
  it("keeps Autoplay separate from the manual queue and turns it off for Repeat", () => {
    const player = usePlayerStore.getState();
    player.setQueue([song("a"), song("b")]);
    player.toggleAutoplay();
    player.appendAutoplayTracks([song("c"), song("d")]);

    player.enqueue([song("e")], "last");
    expect(usePlayerStore.getState().queue.map((item) => item.id)).toEqual([
      "a",
      "b",
      "e",
      "c",
      "d",
    ]);

    player.cycleRepeatMode();
    expect(usePlayerStore.getState()).toMatchObject({
      autoplayEnabled: false,
      repeatMode: 2,
    });
    expect(usePlayerStore.getState().queue.map((item) => item.id)).toEqual([
      "a",
      "b",
      "e",
    ]);
  });

  it("inserts Play Last after an active Autoplay song, before later recommendations", () => {
    const player = usePlayerStore.getState();
    player.setQueue([song("a"), song("b")]);
    player.toggleAutoplay();
    player.appendAutoplayTracks([song("c"), song("d")]);
    player.next();
    player.next();

    player.enqueue([song("e")], "last");

    expect(usePlayerStore.getState()).toMatchObject({
      currentSong: expect.objectContaining({ id: "c", sourceAutoplay: true }),
      currentIndex: 2,
    });
    expect(usePlayerStore.getState().queue.map((item) => item.id)).toEqual([
      "a",
      "b",
      "c",
      "e",
      "d",
    ]);
  });

  it("turns Repeat off when Autoplay is enabled", () => {
    const player = usePlayerStore.getState();
    player.setQueue([song("a")]);
    player.cycleRepeatMode();
    player.toggleAutoplay();

    expect(usePlayerStore.getState()).toMatchObject({
      autoplayEnabled: true,
      repeatMode: 0,
    });
  });

  it("resets Shuffle and restores manual queue order when Autoplay is enabled", () => {
    const player = usePlayerStore.getState();
    player.setQueue([song("a"), song("b"), song("c")]);
    player.toggleShuffle();
    player.toggleAutoplay();

    expect(usePlayerStore.getState()).toMatchObject({
      autoplayEnabled: true,
      shuffleEnabled: false,
      currentSong: expect.objectContaining({ id: "a" }),
      currentIndex: 0,
    });
    expect(usePlayerStore.getState().queue.map((item) => item.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("does not shuffle when only Autoplay songs remain after the current song", () => {
    const player = usePlayerStore.getState();
    player.setQueue([song("a")]);
    player.toggleAutoplay();
    player.appendAutoplayTracks([song("b"), song("c")]);
    player.toggleShuffle();

    expect(usePlayerStore.getState()).toMatchObject({
      currentSong: expect.objectContaining({ id: "a" }),
      shuffleEnabled: false,
    });
  });

  it("keeps the Autoplay preference when a new queue starts", () => {
    const player = usePlayerStore.getState();
    player.setQueue([song("a")]);
    player.toggleAutoplay();
    player.setQueue([song("b"), song("c")]);

    expect(usePlayerStore.getState()).toMatchObject({
      autoplayEnabled: true,
      currentSong: expect.objectContaining({ id: "b" }),
    });
    expect(usePlayerStore.getState().queue.map((item) => item.id)).toEqual([
      "b",
      "c",
    ]);
  });

  it("keeps Autoplay ordered at the end when Shuffle changes", () => {
    const player = usePlayerStore.getState();
    player.setQueue([song("a"), song("b"), song("c")]);
    player.toggleAutoplay();
    player.appendAutoplayTracks([song("d"), song("e")]);

    player.toggleShuffle();
    expect(usePlayerStore.getState().queue[0]?.id).toBe("a");
    expect(usePlayerStore.getState().queue.slice(-2).map((item) => item.id)).toEqual([
      "d",
      "e",
    ]);

    player.toggleShuffle();
    expect(usePlayerStore.getState().queue.map((item) => item.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
  });

  it("keeps Autoplay intact because Repeat is locked on an Autoplay track", () => {
    const player = usePlayerStore.getState();
    player.setQueue([song("a"), song("b")]);
    player.toggleAutoplay();
    player.appendAutoplayTracks([song("c"), song("d")]);
    player.next();
    player.next();

    player.cycleRepeatMode();
    expect(usePlayerStore.getState().queue.map((item) => item.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(usePlayerStore.getState()).toMatchObject({
      currentSong: expect.objectContaining({ id: "c" }),
      currentIndex: 2,
      autoplayEnabled: true,
      repeatMode: 0,
    });
  });

  it("locks Shuffle and Repeat while an Autoplay track is playing", () => {
    const player = usePlayerStore.getState();
    player.setQueue([song("a"), song("b")]);
    player.toggleAutoplay();
    player.appendAutoplayTracks([song("c")]);
    player.next();
    player.next();

    player.toggleShuffle();
    player.cycleRepeatMode();

    expect(usePlayerStore.getState()).toMatchObject({
      currentSong: expect.objectContaining({ id: "c", sourceAutoplay: true }),
      shuffleEnabled: false,
      repeatMode: 0,
    });
  });

  it("resets Shuffle when playback enters the Autoplay section", () => {
    const player = usePlayerStore.getState();
    player.setQueue([song("a"), song("b")]);
    player.toggleShuffle();
    player.toggleAutoplay();
    player.appendAutoplayTracks([song("c")]);

    player.next();
    player.next();

    expect(usePlayerStore.getState()).toMatchObject({
      currentSong: expect.objectContaining({ id: "c", sourceAutoplay: true }),
      shuffleEnabled: false,
      repeatMode: 0,
    });
  });
});

describe("video playback state", () => {
  const videoSong = (id: string, videoId: string): PlayerSong => ({
    ...song(id),
    playbackKind: "video",
    video: { id: videoId },
    playbackUrl: `https://video.test/${videoId}.m3u8`,
  });

  it("keeps playback intact when the video player is closed", () => {
    const player = usePlayerStore.getState();
    const activeVideo = videoSong("song-a", "video-a");
    player.setQueue([activeVideo]);
    player.setPlaybackTimeMs(42_000);
    player.setVideoPlayerOpen(true);
    player.setVideoPlayerOpen(false);

    expect(usePlayerStore.getState()).toMatchObject({
      currentSong: activeVideo,
      playbackTimeMs: 42_000,
      playing: true,
      videoPlayerOpen: false,
    });
  });

  it("closes the video player when playback switches to another source", () => {
    const player = usePlayerStore.getState();
    player.setQueue([videoSong("song-a", "video-a")]);
    player.setVideoPlayerOpen(true);
    player.setQueue([song("audio-b")]);

    expect(usePlayerStore.getState()).toMatchObject({
      currentSong: expect.objectContaining({ id: "audio-b" }),
      videoPlayerOpen: false,
    });
  });

  it("keeps the video player open when queueing directly into another video", () => {
    const player = usePlayerStore.getState();
    player.setQueue([videoSong("song-a", "video-a"), videoSong("song-b", "video-b")]);
    player.setVideoPlayerOpen(true);

    player.next();

    expect(usePlayerStore.getState()).toMatchObject({
      currentSong: expect.objectContaining({
        id: "song-b",
        playbackKind: "video",
      }),
      playing: true,
      videoPlayerOpen: true,
    });
  });

  it("returns to the playbar when a queued transition leaves video playback", () => {
    const player = usePlayerStore.getState();
    player.setQueue([videoSong("song-a", "video-a"), song("audio-b")]);
    player.setVideoPlayerOpen(true);

    player.next();

    expect(usePlayerStore.getState().videoPlayerOpen).toBe(false);
  });

  it("replaces the active video in both queue views without relying on index", () => {
    const player = usePlayerStore.getState();
    const activeVideo = {
      ...song("song-a"),
      playbackKind: "video" as const,
      video: { id: "video-a" },
    };
    const otherSong = song("song-b");

    player.setQueue([activeVideo, otherSong]);
    usePlayerStore.setState({
      originalQueue: [otherSong, activeVideo],
      currentIndex: 0,
    });
    player.replaceCurrentSong({ ...activeVideo, title: "Canonical Song" });

    expect(usePlayerStore.getState().queue[0]?.title).toBe("Canonical Song");
    expect(usePlayerStore.getState().originalQueue[1]?.title).toBe(
      "Canonical Song",
    );
    expect(usePlayerStore.getState().originalQueue[0]?.title).toBe("Song song-b");
  });
});

describe("Song Station queue refill", () => {
  const stationId = "song-station-0123456789abcdef0123456789abcdef";

  const stationSong = (id: string, sourceStationId = stationId): PlayerSong => ({
    ...song(id),
    sourceStation: {
      id: sourceStationId,
      name: "Seed Station",
      artworkUrl: "",
    },
  });

  it("appends only new tracks to the active Station", () => {
    const player = usePlayerStore.getState();
    player.startStation([stationSong("a"), stationSong("b")], "a");

    player.appendStationTracks(stationId, [
      stationSong("b"),
      stationSong("c"),
    ]);

    expect(usePlayerStore.getState().queue.map((item) => item.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("ignores a refill response after the listener has left that Station", () => {
    const player = usePlayerStore.getState();
    player.startStation([stationSong("a")], "a");
    player.setQueue([song("outside")]);

    player.appendStationTracks(stationId, [stationSong("late")]);

    expect(usePlayerStore.getState().queue.map((item) => item.id)).toEqual([
      "outside",
    ]);
  });

  it("keeps the current position when its active release becomes a Station seed", () => {
    const player = usePlayerStore.getState();
    const current = {
      ...song("a"),
      releaseTrackId: "album-track-a",
    };
    player.setSong(current);
    player.setPlaybackTimeMs(81_000);

    player.startStation(
      [{ ...current, sourceStation: stationSong("a").sourceStation }],
      "a",
      true,
    );

    expect(usePlayerStore.getState()).toMatchObject({
      currentSong: expect.objectContaining({
        id: "a",
        releaseTrackId: "album-track-a",
      }),
      playbackTimeMs: 81_000,
      stationMode: true,
    });
  });
});

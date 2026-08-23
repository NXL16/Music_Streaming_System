import { describe, expect, it, vi } from "vitest";
import { playbackTimeMsFromSeconds, syncPlaybackClock } from "./playback-clock";

describe("playback clock", () => {
  it("converts media time to the non-negative millisecond clock used by player state", () => {
    expect(playbackTimeMsFromSeconds(12.9876)).toBe(12_987);
    expect(playbackTimeMsFromSeconds(-1)).toBe(0);
    expect(playbackTimeMsFromSeconds(Number.NaN)).toBe(0);
  });

  it("synchronizes replay and seek positions immediately", () => {
    const setPlaybackTimeMs = vi.fn();
    syncPlaybackClock({ currentTime: 0 }, setPlaybackTimeMs);
    syncPlaybackClock({ currentTime: 42.125 }, setPlaybackTimeMs);
    expect(setPlaybackTimeMs).toHaveBeenNthCalledWith(1, 0);
    expect(setPlaybackTimeMs).toHaveBeenNthCalledWith(2, 42_125);
  });
});

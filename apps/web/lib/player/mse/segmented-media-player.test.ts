import { describe, expect, it, vi } from "vitest";
import { MsePlayer } from "./mse-player";

type PlayerInternals = {
  downloading: boolean;
  needsUrgentFill: boolean;
  onWaiting: () => void;
  onSeeking: () => void;
  fillBuffer: () => Promise<void>;
  metadata: {
    segments: Array<{ startTimeSec: number }>;
  } | null;
  appendedSegments: Set<number>;
  requiredTailStartIndex: number;
  audio: {
    currentTime: number;
    buffered: TimeRanges;
  } | null;
};

describe("SegmentedMediaPlayer stalled playback recovery", () => {
  it("retries a fill when the media element enters waiting after a failed fetch", () => {
    const player = new MsePlayer() as unknown as PlayerInternals;
    const fillBuffer = vi.fn().mockResolvedValue(undefined);
    player.fillBuffer = fillBuffer;
    player.downloading = false;

    player.onWaiting();

    expect(fillBuffer).toHaveBeenCalledOnce();
  });

  it("does not start a second fill while one is already active", () => {
    const player = new MsePlayer() as unknown as PlayerInternals;
    const fillBuffer = vi.fn().mockResolvedValue(undefined);
    player.fillBuffer = fillBuffer;
    player.downloading = true;

    player.onWaiting();

    expect(fillBuffer).not.toHaveBeenCalled();
  });

  it("refetches a seek target evicted by SourceBuffer", () => {
    const player = new MsePlayer() as unknown as PlayerInternals;
    const fillBuffer = vi.fn().mockResolvedValue(undefined);
    player.metadata = {
      segments: [
        { startTimeSec: 0 },
        { startTimeSec: 10 },
        { startTimeSec: 20 },
        { startTimeSec: 30 },
        { startTimeSec: 40 },
        { startTimeSec: 50 },
      ],
    };
    player.audio = {
      currentTime: 12,
      buffered: { length: 0 } as TimeRanges,
    };
    player.appendedSegments = new Set([0, 1, 2, 3, 4, 5]);
    player.fillBuffer = fillBuffer;

    player.onSeeking();

    expect([...player.appendedSegments]).toEqual([0, 5]);
    expect(player.requiredTailStartIndex).toBe(1);
    expect(player.needsUrgentFill).toBe(true);
    expect(fillBuffer).toHaveBeenCalledOnce();
  });
});

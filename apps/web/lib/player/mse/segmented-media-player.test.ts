import { describe, expect, it, vi } from "vitest";
import { MsePlayer } from "./mse-player";

type PlayerInternals = {
  downloading: boolean;
  needsUrgentFill: boolean;
  onWaiting: () => void;
  onSeeking: () => void;
  onBufferedChange: (event: Event) => void;
  fillBuffer: () => Promise<void>;
  fetchAndAppendBatch: () => Promise<void>;
  metadata: {
    segments: Array<{ startTimeSec: number; duration: number }>;
  } | null;
  appendedSegments: Set<number>;
  requiredTailStartIndex: number;
  audio: {
    currentTime: number;
    buffered: TimeRanges;
  } | null;
  sourceBuffer: SourceBuffer | null;
  abortController: AbortController | null;
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
        { startTimeSec: 0, duration: 10 },
        { startTimeSec: 10, duration: 10 },
        { startTimeSec: 20, duration: 10 },
        { startTimeSec: 30, duration: 10 },
        { startTimeSec: 40, duration: 10 },
        { startTimeSec: 50, duration: 10 },
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

  it("refetches fragments Safari reclaims from a managed buffer", () => {
    const player = new MsePlayer() as unknown as PlayerInternals;
    const fillBuffer = vi.fn().mockResolvedValue(undefined);
    player.metadata = {
      segments: [
        { startTimeSec: 0, duration: 10 },
        { startTimeSec: 10, duration: 10 },
        { startTimeSec: 20, duration: 10 },
      ],
    };
    player.audio = {
      currentTime: 10,
      buffered: {
        length: 1,
        start: () => 10,
        end: () => 12,
      } as TimeRanges,
    };
    player.appendedSegments = new Set([0, 1, 2]);
    player.downloading = false;
    player.fillBuffer = fillBuffer;

    player.onBufferedChange({
      removedRanges: {
        length: 1,
        start: () => 20,
        end: () => 30,
      } as TimeRanges,
    } as unknown as Event);

    expect([...player.appendedSegments]).toEqual([0, 1]);
    expect(player.needsUrgentFill).toBe(true);
    expect(fillBuffer).toHaveBeenCalledOnce();
  });

  it("does not mark fragments appended before Safari creates its SourceBuffer", async () => {
    const player = new MsePlayer() as unknown as PlayerInternals;
    const fetchAndAppendBatch = vi.fn().mockResolvedValue(undefined);
    player.metadata = {
      segments: [{ startTimeSec: 0, duration: 10 }],
    };
    player.audio = {
      currentTime: 0,
      buffered: { length: 0 } as TimeRanges,
    };
    player.abortController = new AbortController();
    player.sourceBuffer = null;
    player.fetchAndAppendBatch = fetchAndAppendBatch;

    await player.fillBuffer();

    expect(fetchAndAppendBatch).not.toHaveBeenCalled();
    expect(player.appendedSegments).toEqual(new Set());
  });
});

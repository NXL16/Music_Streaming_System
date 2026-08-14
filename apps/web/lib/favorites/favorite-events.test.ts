import { beforeEach, describe, expect, it, vi } from "vitest";

const browser = vi.hoisted(() => {
  const dispatchEvent = vi.fn();
  const postMessage = vi.fn();
  class FakeBroadcastChannel {
    onmessage: ((event: MessageEvent) => void) | null = null;
    postMessage = postMessage;
  }
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      dispatchEvent,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      BroadcastChannel: FakeBroadcastChannel,
    },
  });
  Object.defineProperty(globalThis, "BroadcastChannel", {
    configurable: true,
    value: FakeBroadcastChannel,
  });
  return { dispatchEvent, postMessage };
});

import { notifyFavoriteChanged } from "./favorite-events";

describe("favorite change events", () => {
  beforeEach(() => vi.clearAllMocks());

  it("publishes a completed mutation locally and to other tabs", () => {
    notifyFavoriteChanged("song-1", true);

    expect(browser.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(browser.postMessage).toHaveBeenCalledWith({
      songId: "song-1",
      isFavorite: true,
    });
  });
});

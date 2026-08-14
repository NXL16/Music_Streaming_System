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
    value: { dispatchEvent, BroadcastChannel: FakeBroadcastChannel },
  });
  Object.defineProperty(globalThis, "BroadcastChannel", {
    configurable: true,
    value: FakeBroadcastChannel,
  });
  return { dispatchEvent, postMessage };
});

const queryCache = vi.hoisted(() => ({ invalidateCachedQuery: vi.fn() }));
vi.mock("@/lib/api/query-cache", () => queryCache);

import { notifyPlaylistChanged } from "./playlist-events";

describe("playlist change events", () => {
  beforeEach(() => vi.clearAllMocks());

  it("invalidates local playlist data and broadcasts the typed change", () => {
    notifyPlaylistChanged("p1", "u1");

    expect(queryCache.invalidateCachedQuery).toHaveBeenCalledWith(
      "playlist:p1",
    );
    expect(queryCache.invalidateCachedQuery).toHaveBeenCalledWith(
      "user-playlists:u1",
    );
    expect(browser.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(browser.postMessage).toHaveBeenCalledWith({
      playlistId: "p1",
      userId: "u1",
    });
  });

  it("keeps creation metadata when synchronizing an immediate UI insert", () => {
    notifyPlaylistChanged("p-new", "u1", {
      operation: "create",
      playlist: { id: "p-new", name: "Fresh playlist" },
    });

    expect(browser.postMessage).toHaveBeenCalledWith({
      playlistId: "p-new",
      userId: "u1",
      operation: "create",
      playlist: { id: "p-new", name: "Fresh playlist" },
    });
  });
});

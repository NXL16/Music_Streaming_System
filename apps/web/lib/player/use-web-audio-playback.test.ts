import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  type State = {
    currentSong: {
      id: string;
      playbackUrl: string;
      playbackKind?: "audio" | "video";
    } | null;
    playing: boolean;
    playbackRate: number;
    pause: () => void;
  };
  type Cell = {
    value?: unknown;
    deps?: unknown[];
    cleanup?: () => void;
    ref?: { current: unknown };
  };
  const cells: Cell[] = [];
  const effects: Array<() => void> = [];
  const listeners = new Set<(state: State, previous: State) => void>();
  let cursor = 0;
  const state: State = {
    currentSong: { id: "a", playbackUrl: "stream:a" },
    playing: true,
    playbackRate: 1,
    pause: () => update({ playing: false }),
  };
  function update(patch: Partial<State>) {
    const previous = { ...state };
    Object.assign(state, patch);
    for (const listener of listeners) listener(state, previous);
  }
  return {
    cells,
    effects,
    state,
    update,
    listeners,
    begin: () => {
      cursor = 0;
      effects.length = 0;
    },
    cell: () => cells[cursor++] ?? (cells[cursor - 1] = {}),
    reset: () => {
      cells.length = 0;
      effects.length = 0;
      listeners.clear();
      cursor = 0;
    },
    players: [] as Array<{
      currentTime: number;
      play: ReturnType<typeof vi.fn>;
      pause: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
      fail: (error: unknown) => void;
      setVolume: ReturnType<typeof vi.fn>;
    }>,
    loading: null as null | (() => Promise<void>),
  };
});

vi.mock("react", () => ({
  useCallback: (callback: unknown, deps: unknown[]) => {
    const cell = harness.cell();
    if (
      !cell.deps ||
      !deps.every((value, index) => Object.is(value, cell.deps?.[index]))
    ) {
      cell.value = callback;
      cell.deps = deps;
    }
    return cell.value;
  },
  useRef: (value: unknown) => {
    const cell = harness.cell();
    cell.ref ??= { current: value };
    return cell.ref;
  },
  useState: (initial: unknown) => {
    const cell = harness.cell();
    if (!("value" in cell)) cell.value = initial;
    return [
      cell.value,
      (next: unknown) => {
        cell.value = typeof next === "function" ? next(cell.value) : next;
      },
    ];
  },
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    const cell = harness.cell();
    if (
      cell.deps &&
      deps.every((value, index) => Object.is(value, cell.deps?.[index]))
    )
      return;
    cell.deps = deps;
    harness.effects.push(() => {
      cell.cleanup?.();
      cell.cleanup = effect() || undefined;
    });
  },
}));
vi.mock("./use-player-store", () => ({
  usePlayerStore: Object.assign(
    (select: (state: typeof harness.state) => unknown) => select(harness.state),
    {
      getState: () => harness.state,
      subscribe: (
        listener: (
          state: typeof harness.state,
          previous: typeof harness.state,
        ) => void,
      ) => {
        harness.listeners.add(listener);
        return () => {
          harness.listeners.delete(listener);
        };
      },
    },
  ),
}));
vi.mock("./audio-session", () => ({
  acquirePlaybackAudioSession: vi.fn(() => vi.fn()),
}));
vi.mock("./web-audio/quality-policy", () => ({
  shouldPreferHighQuality: () => false,
  selectInitialRendition: (manifest: unknown) => manifest,
}));
vi.mock("./stream.api", () => ({
  getPlaybackManifest: vi.fn(),
  getHighPlaybackManifestWithTimeout: vi.fn(),
}));
vi.mock("./web-audio/web-audio-player", () => ({
  WebAudioPlayer: class {
    currentTime = 0;
    play = vi.fn(async () => {});
    pause = vi.fn();
    dispose = vi.fn();
    setVolume = vi.fn();
    setVocalVolume = vi.fn();
    setPlaybackRate = vi.fn();
    constructor(
      _context: unknown,
      _update: unknown,
      public fail: (error: unknown) => void,
    ) {
      harness.players.push(this);
    }
    async load(_manifest: unknown, time: number) {
      this.currentTime = time;
      await harness.loading?.();
    }
    async seek(time: number) {
      this.currentTime = time;
    }
  },
}));

import { useWebAudioPlayback } from "./use-web-audio-playback";
import { acquirePlaybackAudioSession } from "./audio-session";
import { getPlaybackManifest } from "./stream.api";
import type { PlaybackManifest } from "./web-audio/types";

class Context {
  static instances: Context[] = [];
  state = "suspended";
  sampleRate = 48_000;
  close = vi.fn(async () => {
    this.state = "closed";
  });
  constructor() {
    Context.instances.push(this);
  }
}
function WebAudioHarness(volume = 0.8) {
  harness.begin();
  const result = useWebAudioPlayback(volume, 0.5);
  for (const effect of harness.effects) effect();
  return result;
}
async function settle() {
  for (let turn = 0; turn < 40; turn += 1) await Promise.resolve();
}

beforeEach(() => {
  harness.reset();
  harness.players.length = 0;
  harness.loading = null;
  Context.instances = [];
  harness.update({
    currentSong: { id: "a", playbackUrl: "stream:a" },
    playing: true,
    playbackRate: 1,
  });
  vi.stubGlobal("AudioContext", Context);
  vi.stubGlobal(
    "document",
    Object.assign(new EventTarget(), { hidden: false }),
  );
  vi.stubGlobal("window", new EventTarget());
  vi.mocked(getPlaybackManifest).mockResolvedValue({
    mode: "STANDARD",
    main: { metadata: { timescale: 48_000 } },
  } as PlaybackManifest);
});
afterEach(() => {
  for (const cell of harness.cells) cell.cleanup?.();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("web-audio hook ownership", () => {
  it("configures the playback session before opening the audio output", async () => {
    vi.stubGlobal(
      "AudioContext",
      class extends Context {
        constructor() {
          expect(acquirePlaybackAudioSession).toHaveBeenCalledTimes(1);
          super();
        }
      },
    );
    WebAudioHarness();
    await settle();
    expect(Context.instances).toHaveLength(1);
    expect(harness.players[0].play).toHaveBeenCalledTimes(1);
  });

  it("releases the playback session if audio output creation fails", async () => {
    const release = vi.fn();
    vi.mocked(acquirePlaybackAudioSession).mockReturnValueOnce(release);
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          throw new Error("Output unavailable");
        }
      },
    );
    WebAudioHarness();
    await settle();
    expect(release).toHaveBeenCalledTimes(1);
    expect(harness.state.playing).toBe(false);
    expect(harness.players).toHaveLength(0);
  });

  it("publishes the current transport in the background when animation frames do not run", async () => {
    Object.assign(document, { hidden: true });
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 0),
    );
    WebAudioHarness();
    await settle();
    expect(WebAudioHarness().transport).not.toBeNull();
    const previous = WebAudioHarness().transport;
    harness.update({ currentSong: { id: "b", playbackUrl: "stream:b" } });
    WebAudioHarness();
    await settle();
    expect(WebAudioHarness().transport).not.toBe(previous);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("stops playback on an early loading failure before transport publication", async () => {
    const frames: Array<() => void> = [];
    vi.stubGlobal("queueMicrotask", (callback: () => void) => {
      frames.push(callback);
    });
    vi.mocked(getPlaybackManifest).mockRejectedValueOnce(
      new Error("Manifest unavailable"),
    );
    WebAudioHarness();
    await settle();
    expect(harness.state.playing).toBe(false);
    expect(vi.mocked(getPlaybackManifest).mock.calls[0][1]?.aborted).toBe(true);
    for (const frame of frames) frame();
    expect(WebAudioHarness().transport?.error?.message).toBe(
      "Manifest unavailable",
    );
  });

  it.each(["stream:a", "mse:a"])(
    "uses the same Web Audio player for current and persisted catalog references (%s)",
    async (playbackUrl) => {
      harness.update({ currentSong: { id: "a", playbackUrl } });
      WebAudioHarness();
      await settle();
      expect(getPlaybackManifest).toHaveBeenCalledExactlyOnceWith(
        "a",
        expect.any(AbortSignal),
      );
      expect(harness.players).toHaveLength(1);
      expect(harness.players[0].play).toHaveBeenCalledTimes(1);
      expect(WebAudioHarness().transport?.dataset.playbackEngine).toBe(
        "web-audio",
      );
    },
  );

  it("does not create a player without an active song", async () => {
    harness.update({ currentSong: null });
    WebAudioHarness();
    await settle();
    expect(getPlaybackManifest).not.toHaveBeenCalled();
    expect(harness.players).toHaveLength(0);
    expect(Context.instances).toHaveLength(0);
  });

  it("does not emit web-audio audio for a music-video session", async () => {
    harness.update({
      currentSong: { id: "a", playbackUrl: "stream:a", playbackKind: "video" },
    });
    const result = WebAudioHarness();
    await settle();
    expect(result.active).toBe(false);
    expect(getPlaybackManifest).not.toHaveBeenCalled();
    expect(harness.players).toHaveLength(0);
  });
  it.each([
    null,
    { id: "video", playbackUrl: "video.m3u8", playbackKind: "video" as const },
  ])(
    "releases the music transport when switching to %j",
    async (currentSong) => {
      WebAudioHarness();
      await settle();
      expect(WebAudioHarness().transport).not.toBeNull();
      const old = harness.players[0];
      harness.update({ currentSong });
      const result = WebAudioHarness();
      await settle();
      expect(old.dispose).toHaveBeenCalledTimes(1);
      expect(result.transport).toBeNull();
      expect(result.isStemActive).toBe(false);
    },
  );

  it("applies muted volume before starting the main player", async () => {
    WebAudioHarness(0);
    await settle();
    expect(harness.players).toHaveLength(1);
    expect(harness.players[0].currentTime).toBe(0);
    expect(harness.players[0].setVolume).toHaveBeenCalledWith(0);
    expect(harness.players[0].play).toHaveBeenCalledTimes(1);
  });
  it("disposes a loading engine synchronously on a song change and ignores its late failure", async () => {
    let finish!: () => void;
    harness.loading = () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      });
    WebAudioHarness();
    await settle();
    const old = harness.players[0];
    harness.update({
      currentSong: { id: "b", playbackUrl: "stream:b" },
      playing: true,
    });
    expect(old.dispose).toHaveBeenCalledTimes(1);
    old.fail(new Error("Old decoder failure"));
    expect(harness.state.playing).toBe(true);
    finish();
    await settle();
    expect(old.play).not.toHaveBeenCalled();
  });
  it("recreates a disposed session when rapid track changes return to the original song before rendering", async () => {
    WebAudioHarness();
    await settle();
    const old = harness.players[0];
    harness.update({ currentSong: { id: "b", playbackUrl: "stream:b" } });
    harness.update({ currentSong: { id: "a", playbackUrl: "stream:a" } });
    WebAudioHarness();
    await settle();
    expect(old.dispose).toHaveBeenCalledTimes(1);
    expect(harness.players).toHaveLength(2);
    expect(harness.players[1].play).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    "does not expose a disposed transport before the new session is published (return to original: %s)",
    async (returnToOriginal) => {
      WebAudioHarness();
      await settle();
      const old = WebAudioHarness().transport;
      harness.update({ currentSong: { id: "b", playbackUrl: "stream:b" } });
      if (returnToOriginal)
        harness.update({ currentSong: { id: "a", playbackUrl: "stream:a" } });
      expect(WebAudioHarness().transport).toBeNull();
      await settle();
      expect(WebAudioHarness().transport).not.toBeNull();
      expect(WebAudioHarness().transport).not.toBe(old);
    },
  );

  it("reuses one output context across songs with different sample rates, then closes it on unmount", async () => {
    WebAudioHarness();
    await settle();
    vi.mocked(getPlaybackManifest).mockResolvedValueOnce({
      mode: "STANDARD",
      main: { metadata: { timescale: 44_100 } },
    } as PlaybackManifest);
    harness.update({ currentSong: { id: "b", playbackUrl: "stream:b" } });
    WebAudioHarness();
    await settle();
    expect(harness.players).toHaveLength(2);
    expect(Context.instances).toHaveLength(1);
    for (const cell of harness.cells) cell.cleanup?.();
    expect(harness.players[1].dispose).toHaveBeenCalledTimes(1);
    expect(Context.instances[0].close).toHaveBeenCalledTimes(1);
  });
  it("reloads after a fatal error at the last position only when Play is requested", async () => {
    WebAudioHarness();
    await settle();
    const old = harness.players[0];
    old.currentTime = 85;
    old.fail(new Error("Decoder failed"));
    expect(harness.state.playing).toBe(false);
    WebAudioHarness();
    await settle();
    expect(harness.players).toHaveLength(1);
    harness.update({ playing: true });
    WebAudioHarness();
    await settle();
    expect(harness.players).toHaveLength(2);
    expect(harness.players[1].currentTime).toBe(85);
    expect(old.dispose).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { WebAudioTransport } from "./web-audio-transport";
import type { WebAudioPlayer, WebAudioState } from "./web-audio-player";

function fixture() {
  const failure = vi.fn();
  const transport = new WebAudioTransport(failure);
  const engine = {
    currentTime: 0,
    setVolume: vi.fn(),
    setVocalVolume: vi.fn(),
    setPlaybackRate: vi.fn(),
    play: vi.fn(async () => {}),
    pause: vi.fn(),
    dispose: vi.fn(),
    seek: vi.fn(async (value: number) => {
      engine.currentTime = value;
    }),
  };
  const state: WebAudioState = {
    position: 0,
    duration: 200,
    playing: false,
    waiting: false,
    bufferedEnd: 30,
    ended: false,
  };
  const bind = () =>
    transport.bind(engine as unknown as WebAudioPlayer, "stem");
  return { failure, transport, engine, state, bind };
}

afterEach(() => vi.useRealTimers());

describe("web-audio player transport", () => {
  it("does not rewind audio that started advancing before loading was bound", () => {
    const { transport, engine } = fixture();
    transport.own(engine as unknown as WebAudioPlayer);
    engine.currentTime = 0.3;
    transport.bind(engine as unknown as WebAudioPlayer, "stem", 0);
    expect(engine.seek).not.toHaveBeenCalled();
    expect(transport.currentTime).toBe(0.3);
    transport.dispose();
  });

  it("applies a newer seek requested during loading when the transport binds", async () => {
    const { transport, engine } = fixture();
    transport.own(engine as unknown as WebAudioPlayer);
    transport.currentTime = 60;
    transport.bind(engine as unknown as WebAudioPlayer, "stem", 0);
    await Promise.resolve();
    expect(engine.seek).toHaveBeenCalledTimes(1);
    expect(engine.seek).toHaveBeenCalledWith(60);
    expect(transport.currentTime).toBe(60);
    transport.dispose();
  });

  it("applies muted volume and vocal level before asynchronous loading can play", () => {
    const { transport, engine } = fixture();
    transport.volume = 0;
    transport.setVocalVolume(0.25);
    transport.playbackRate = 1.25;
    transport.own(engine as unknown as WebAudioPlayer);
    expect(engine.setVolume).toHaveBeenLastCalledWith(0);
    expect(engine.setVocalVolume).toHaveBeenLastCalledWith(0.25);
    expect(engine.setPlaybackRate).toHaveBeenLastCalledWith(1.25);
    transport.bind(engine as unknown as WebAudioPlayer, "stem");
    expect(engine.setVolume).toHaveBeenCalledTimes(1);
    expect(engine.setVocalVolume).toHaveBeenCalledTimes(1);
    expect(engine.setPlaybackRate).toHaveBeenCalledTimes(1);
    transport.dispose();
  });

  it("disposes an engine still loading and rejects late ownership", () => {
    const { transport, engine } = fixture();
    transport.own(engine as unknown as WebAudioPlayer);
    transport.dispose();
    transport.dispose();
    expect(engine.dispose).toHaveBeenCalledTimes(1);
    const late = { ...engine, dispose: vi.fn() };
    transport.own(late as unknown as WebAudioPlayer);
    expect(late.dispose).toHaveBeenCalledTimes(1);
  });

  it("does not announce end-of-track merely because a paused seek reaches the end", () => {
    const { transport, state } = fixture();
    const ended = vi.fn();
    transport.addEventListener("ended", ended);
    transport.update({ ...state, position: 200, bufferedEnd: 200 });
    expect(ended).not.toHaveBeenCalled();
    transport.update({
      ...state,
      position: 200,
      bufferedEnd: 200,
      ended: true,
    });
    transport.update({
      ...state,
      position: 200,
      bufferedEnd: 200,
      ended: true,
    });
    expect(ended).toHaveBeenCalledTimes(1);
    transport.dispose();
  });

  it("announces seek completion only for the latest overlapping seek", async () => {
    const { transport, engine, bind } = fixture();
    bind();
    const completions: Array<() => void> = [];
    engine.seek.mockImplementation((time) => {
      engine.currentTime = time;
      return new Promise<void>((resolve) => completions.push(resolve));
    });
    const seeked = vi.fn();
    transport.addEventListener("seeked", seeked);
    transport.currentTime = 20;
    transport.currentTime = 60;
    completions[0]();
    await Promise.resolve();
    expect(seeked).not.toHaveBeenCalled();
    expect(transport.seeking).toBe(true);
    completions[1]();
    await Promise.resolve();
    expect(seeked).toHaveBeenCalledTimes(1);
    expect(transport.seeking).toBe(false);
    expect(transport.currentTime).toBe(60);
    transport.dispose();
  });

  it("keeps replay's reset when an ended listener immediately seeks to the start", () => {
    const { transport, state } = fixture();
    transport.addEventListener("ended", () => {
      transport.currentTime = 0;
      transport.update(state);
    });
    transport.update({
      ...state,
      position: 200,
      bufferedEnd: 200,
      ended: true,
    });
    expect(transport.ended).toBe(false);
    transport.dispose();
  });

  it("exposes the requested time during seeking before decoder output arrives", async () => {
    const { transport, engine, bind } = fixture();
    bind();
    let resolve!: () => void;
    engine.seek.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const observed: number[] = [];
    transport.addEventListener("seeking", () =>
      observed.push(transport.currentTime),
    );
    transport.currentTime = 80;
    expect(observed).toEqual([80]);
    expect(transport.currentTime).toBe(80);
    engine.currentTime = 80;
    resolve();
    await Promise.resolve();
    expect(transport.currentTime).toBe(80);
    transport.dispose();
  });

  it("ignores an older seek's abort rejection after a new seek replaces it", async () => {
    const { transport, engine, failure, bind } = fixture();
    bind();
    let reject!: (reason: unknown) => void;
    engine.seek.mockImplementationOnce(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        }),
    );
    transport.currentTime = 20;
    transport.currentTime = 60;
    reject(new DOMException("Replaced", "AbortError"));
    await Promise.resolve();
    await Promise.resolve();
    expect(failure).not.toHaveBeenCalled();
    expect(transport.error).toBeNull();
    expect(transport.currentTime).toBe(60);
    transport.dispose();
  });

  it("ignores a stale play rejection after the user pauses", async () => {
    vi.useFakeTimers();
    const { transport, engine, failure, bind } = fixture();
    bind();
    let reject!: (error: Error) => void;
    engine.play.mockImplementationOnce(
      () =>
        new Promise<void>((_, rejectPromise) => {
          reject = rejectPromise;
        }),
    );
    const playing = transport.play().catch(transport.fail);
    transport.pause();
    reject(new Error("Old play interrupted"));
    await playing;
    expect(failure).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    transport.dispose();
  });

  it("reports an actual autoplay rejection without rebuilding the decoder", async () => {
    const { transport, engine, failure, bind } = fixture();
    bind();
    const blocked = new DOMException(
      "User gesture required",
      "NotAllowedError",
    );
    engine.play.mockRejectedValueOnce(blocked);
    await transport.play().catch(transport.fail);
    expect(transport.error).toBeNull();
    expect(transport.paused).toBe(true);
    expect(failure).toHaveBeenCalledWith(blocked);
    await transport.play();
    expect(transport.paused).toBe(false);
    expect(engine.dispose).not.toHaveBeenCalled();
    transport.dispose();
  });
});

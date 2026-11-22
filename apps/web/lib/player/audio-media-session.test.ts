import { afterEach, describe, expect, it, vi } from "vitest";
import { bindAudioMediaSession } from "./audio-media-session";
import { WebAudioTransport } from "./web-audio/web-audio-transport";
import type { WebAudioPlayer } from "./web-audio/web-audio-player";

function fixture(playing = true) {
  const metadata = { title: "Song" };
  const session = {
    metadata,
    playbackState: "none" as MediaSessionPlaybackState,
    setPositionState: vi.fn(),
  };
  const engine = {
    currentTime: 37.5,
    play: vi.fn(async () => {}),
    pause: vi.fn(),
    dispose: vi.fn(),
    setVolume: vi.fn(),
    setVocalVolume: vi.fn(),
    setPlaybackRate: vi.fn(),
    seek: vi.fn(async (time: number) => {
      engine.currentTime = time;
    }),
  };
  const failure = vi.fn();
  const audio = new WebAudioTransport(failure);
  audio.own(engine as unknown as WebAudioPlayer);
  audio.update({
    position: 37.5,
    duration: 200,
    playing,
    waiting: false,
    bufferedEnd: 100,
  });
  audio.bind(engine as unknown as WebAudioPlayer, "stem", 0);
  const state = { playing };
  const binding = bindAudioMediaSession(session, audio, {
    isPlaying: () => state.playing,
  });
  const dispose = () => {
    binding.dispose();
    audio.dispose();
  };
  return {
    audio,
    engine,
    session,
    metadata,
    state,
    binding,
    dispose,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("audio media-session synchronization", () => {
  it("keeps the same position and metadata across pause and resume without an animation frame", async () => {
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 0),
    );
    const { audio, engine, session, metadata, state, dispose } = fixture();
    state.playing = false;
    audio.pause();
    expect(session.playbackState).toBe("paused");
    expect(session.setPositionState).toHaveBeenLastCalledWith({
      duration: 200,
      position: 37.5,
      playbackRate: 1,
    });
    state.playing = true;
    await audio.play();
    expect(session.playbackState).toBe("playing");
    expect(session.setPositionState).toHaveBeenLastCalledWith({
      duration: 200,
      position: 37.5,
      playbackRate: 1,
    });
    expect(session.metadata).toBe(metadata);
    expect(engine.seek).not.toHaveBeenCalled();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    dispose();
  });

  it("publishes playback intent immediately even before React or a media event runs", () => {
    const { session, state, binding, dispose } = fixture();
    state.playing = false;
    binding.sync();
    expect(session.playbackState).toBe("paused");
    expect(session.setPositionState).toHaveBeenLastCalledWith(
      expect.objectContaining({ position: 37.5 }),
    );
    dispose();
  });

  it("keeps a paused seek paused and republishes the decoder's actual completed position", async () => {
    const { audio, engine, session, dispose } = fixture(false);
    let finish!: () => void;
    engine.seek.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    audio.currentTime = 90;
    expect(audio.seeking).toBe(true);
    expect(session.setPositionState).toHaveBeenLastCalledWith(
      expect.objectContaining({ position: 90 }),
    );
    engine.currentTime = 89.9;
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(session.setPositionState).toHaveBeenLastCalledWith(
      expect.objectContaining({ position: 89.9 }),
    );
    expect(engine.play).not.toHaveBeenCalled();
    expect(session.playbackState).toBe("paused");
    dispose();
  });

  it("detaches synchronization listeners after disposal", () => {
    const { audio, session, binding, dispose } = fixture();
    binding.dispose();
    session.setPositionState.mockClear();
    audio.dispatchEvent(new Event("pause"));
    expect(session.setPositionState).not.toHaveBeenCalled();
    dispose();
  });
});

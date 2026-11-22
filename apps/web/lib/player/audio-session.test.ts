import { afterEach, describe, expect, it, vi } from "vitest";
import { acquirePlaybackAudioSession } from "./audio-session";

afterEach(() => vi.unstubAllGlobals());
describe("playback audio-session ownership", () => {
  it("restores the original mode only after the final owner releases", () => {
    const session = { type: "auto" };
    vi.stubGlobal("navigator", { audioSession: session });
    const first = acquirePlaybackAudioSession();
    const second = acquirePlaybackAudioSession();
    expect(session.type).toBe("playback");
    first();
    first();
    expect(session.type).toBe("playback");
    second();
    second();
    expect(session.type).toBe("auto");
  });
  it("preserves a mode changed by another owner", () => {
    const session = { type: "auto" };
    vi.stubGlobal("navigator", { audioSession: session });
    const release = acquirePlaybackAudioSession();
    session.type = "play-and-record";
    release();
    expect(session.type).toBe("play-and-record");
  });
  it("tolerates browsers without audio-session support", () => {
    vi.stubGlobal("navigator", {});
    const release = acquirePlaybackAudioSession();
    expect(() => {
      release();
      release();
    }).not.toThrow();
  });
});

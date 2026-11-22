import type { PlaybackAudio } from "../playback-audio";
import type { WebAudioPlayer, WebAudioState } from "./web-audio-player";

export class WebAudioTransport extends EventTarget implements PlaybackAudio {
  readonly dataset: DOMStringMap = {
    playbackEngine: "web-audio",
    playbackMode: "loading",
  };
  defaultPlaybackRate = 1;
  preservesPitch = false;
  error: PlaybackAudio["error"] = null;
  private engine: WebAudioPlayer | null = null;
  private ready = false;
  private state: WebAudioState | null = null;
  private desiredPlaying = false;
  private disposed = false;
  private pendingTime = 0;
  private level = 1;
  private vocalLevel = 1;
  private rate = 1;
  private wasReady = false;
  private wasEnded = false;
  private seekVersion = 0;
  private inSeek = false;
  private playVersion = 0;
  private pendingPlays = new Set<() => void>();

  constructor(private readonly onFailure: (error: unknown) => void) {
    super();
  }

  own(engine: WebAudioPlayer): void {
    if (this.disposed) engine.dispose();
    else if (this.engine !== engine) {
      this.engine = engine;
      engine.setVolume(this.level);
      engine.setVocalVolume(this.vocalLevel);
      engine.setPlaybackRate(this.rate);
    }
  }

  bind(
    engine: WebAudioPlayer,
    mode: "stem" | "standard",
    loadedTime = this.pendingTime,
  ): void {
    this.own(engine);
    if (this.disposed) return;
    this.ready = true;
    this.dataset.playbackMode = mode;
    if (Math.abs(loadedTime - this.pendingTime) > 0.001)
      this.currentTime = this.pendingTime;
  }

  update = (state: WebAudioState): void => {
    if (this.disposed) return;
    const previous = this.state;
    this.state = state;
    if (!previous || state.duration !== previous.duration) {
      this.emit("loadedmetadata");
      this.emit("durationchange");
    }
    const ready =
      state.bufferedEnd > state.position + 0.01 ||
      state.position >= state.duration;
    if (ready && !this.wasReady) this.emit("canplay");
    this.wasReady = ready;
    if (state.waiting && !previous?.waiting) this.emit("waiting");
    if (state.playing && !previous?.playing) this.emit("playing");
    if (!previous || Math.abs(state.position - previous.position) >= 0.001)
      this.emit("timeupdate");
    this.emit("progress");
    const ended = state.ended === true;
    const announceEnd = ended && !this.wasEnded;
    this.wasEnded = ended;
    if (announceEnd) {
      this.desiredPlaying = false;
      this.emit("ended");
    }
  };

  get currentTime(): number {
    return this.ready && !this.inSeek
      ? (this.engine?.currentTime ?? this.pendingTime)
      : this.pendingTime;
  }
  set currentTime(value: number) {
    if (this.disposed || !Number.isFinite(value)) return;
    this.pendingTime = Math.max(
      0,
      this.duration ? Math.min(value, this.duration) : value,
    );
    this.wasEnded = false;
    if (!this.engine || !this.ready) return;
    const version = ++this.seekVersion;
    this.inSeek = true;
    this.emit("seeking");
    void this.engine
      .seek(this.pendingTime)
      .then(() => {
        if (this.disposed || version !== this.seekVersion) return;
        this.inSeek = false;
        this.emit("seeked");
        this.emit("timeupdate");
      })
      .catch((error: unknown) => {
        if (!this.disposed && version === this.seekVersion) this.fail(error);
      });
  }
  get duration(): number {
    return this.state?.duration ?? 0;
  }
  get paused(): boolean {
    return !this.desiredPlaying;
  }
  get seeking(): boolean {
    return this.inSeek;
  }
  get ended(): boolean {
    return this.wasEnded;
  }
  get readyState(): number {
    return this.error ? 0 : this.wasReady ? 4 : this.duration ? 1 : 0;
  }
  get networkState(): number {
    return this.state?.waiting ? 2 : this.duration ? 1 : 0;
  }
  get buffered(): TimeRanges {
    const start = this.currentTime;
    const end = this.state?.bufferedEnd ?? start;
    const valid = end > start;
    const check = (index: number) => {
      if (!valid || index !== 0)
        throw new DOMException("Invalid buffered range", "IndexSizeError");
    };
    return {
      length: valid ? 1 : 0,
      start: (index) => {
        check(index);
        return start;
      },
      end: (index) => {
        check(index);
        return end;
      },
    };
  }
  get playbackRate(): number {
    return this.rate;
  }
  set playbackRate(value: number) {
    if (!Number.isFinite(value)) return;
    this.rate = Math.max(0.5, Math.min(2, value));
    this.engine?.setPlaybackRate(this.rate);
    this.emit("ratechange");
  }
  get volume(): number {
    return this.level;
  }
  set volume(value: number) {
    if (!Number.isFinite(value)) return;
    const level = Math.max(0, Math.min(1, value));
    if (level === this.level) return;
    this.level = level;
    this.engine?.setVolume(this.level);
  }
  setVocalVolume(value: number): void {
    if (!Number.isFinite(value)) return;
    const level = Math.max(0, Math.min(1, value));
    if (level === this.vocalLevel) return;
    this.vocalLevel = level;
    this.engine?.setVocalVolume(this.vocalLevel);
  }
  async play(): Promise<void> {
    if (this.disposed) return;
    if (this.error) throw new Error(this.error.message);
    const announce = !this.desiredPlaying;
    this.desiredPlaying = true;
    const version = ++this.playVersion;
    if (announce) this.emit("play");
    if (!this.engine) return;
    const engine = this.engine;
    try {
      await new Promise<void>((resolve, reject) => {
        const cancel = () => {
          this.pendingPlays.delete(cancel);
          resolve();
        };
        this.pendingPlays.add(cancel);
        engine.play().then(cancel, (error: unknown) => {
          this.pendingPlays.delete(cancel);
          reject(error);
        });
      });
    } catch (error) {
      if (!this.disposed && version === this.playVersion) throw error;
    }
  }
  pause(): void {
    if (this.disposed) return;
    this.playVersion += 1;
    for (const cancel of this.pendingPlays) cancel();
    this.desiredPlaying = false;
    this.engine?.pause();
    this.emit("pause");
  }
  fail = (error: unknown): void => {
    if (this.disposed || this.error) return;
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      this.pause();
      this.onFailure(error);
      return;
    }
    this.error = {
      code: 3,
      message: error instanceof Error ? error.message : String(error),
    };
    this.inSeek = false;
    this.pause();
    this.emit("error");
    this.onFailure(error);
  };
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.desiredPlaying = false;
    this.seekVersion += 1;
    this.playVersion += 1;
    for (const cancel of this.pendingPlays) cancel();
    this.engine?.dispose();
    this.engine = null;
  }
  private emit(type: string): void {
    this.dispatchEvent(new Event(type));
  }
}

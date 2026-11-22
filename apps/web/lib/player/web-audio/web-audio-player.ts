import { decryptChunk, hexToBytes, importAesKey } from "./crypto";
import type { PlaybackManifest, StemPlayback } from "./types";
import { readAacConfiguration, readAacPackets } from "./aac-demuxer";
import { PcmAssembler, type PcmBlock } from "./pcm-assembler";
import { fetchWebAudioRange } from "./web-audio-network";

type PcmData = {
  timestamp: number;
  numberOfFrames: number;
  numberOfChannels: number;
  sampleRate: number;
  copyTo(
    destination: Float32Array,
    options: { planeIndex: number; format: "f32-planar" },
  ): void;
  close(): void;
};
type Decoder = EventTarget & {
  readonly decodeQueueSize: number;
  configure(configuration: ReturnType<typeof readAacConfiguration>): void;
  decode(chunk: unknown): void;
  flush(): Promise<void>;
  close(): void;
};
type AudioCodecs = {
  AudioDecoder: (new (callbacks: {
    output: (data: PcmData) => void;
    error: (error: Error) => void;
  }) => Decoder) & {
    isConfigSupported?: (
      configuration: ReturnType<typeof readAacConfiguration>,
    ) => Promise<{ supported?: boolean }>;
  };
  EncodedAudioChunk: new (init: {
    type: "key";
    timestamp: number;
    duration: number;
    data: Uint8Array;
  }) => unknown;
};
type Span = {
  start: number;
  end: number;
  buffer: AudioBuffer;
  scheduledUntil: number;
};
type TrackConfiguration = {
  key: CryptoKey;
  iv: Uint8Array;
  configuration: ReturnType<typeof readAacConfiguration>;
};
const AAC_SEEK_PREROLL_SECONDS = 0.25;
const MAX_DECODE_QUEUE = 64;
const RESUME_BUFFER_SECONDS = 0.1;
const FADE_SECONDS = 0.008;
type ScheduledSource = {
  node: AudioBufferSourceNode;
  gain: GainNode;
  when: number;
  end: number;
  fade: number;
  tailFade: number;
  release: () => void;
};

function segmentAt(
  segments: StemPlayback["metadata"]["segments"],
  time: number,
): number {
  let first = 0;
  let last = segments.length - 1;
  while (first < last) {
    const middle = (first + last + 1) >>> 1;
    if (segments[middle].startTimeSec <= time) first = middle;
    else last = middle - 1;
  }
  return first;
}

type Track = {
  stream: StemPlayback;
  key: CryptoKey;
  iv: Uint8Array;
  configuration: ReturnType<typeof readAacConfiguration>;
  decoder: Decoder;
  pcm: PcmAssembler;
  nextIndex: number;
  initialEndIndex: number;
  decodeFrom: number;
  spans: Span[];
  gain: GainNode;
  closed: boolean;
  sources: number;
};

export type WebAudioState = {
  position: number;
  duration: number;
  playing: boolean;
  waiting: boolean;
  bufferedEnd: number;
  ended?: boolean;
};

export function canUseWebAudioDecoder(): boolean {
  const codecs = globalThis as unknown as Partial<AudioCodecs>;
  return (
    typeof codecs.AudioDecoder === "function" &&
    typeof codecs.EncodedAudioChunk === "function"
  );
}

export class WebAudioPlayer {
  private tracks: Track[] = [];
  private nodes = new Set<ScheduledSource>();
  private retiring = new Set<ScheduledSource>();
  private controller = new AbortController();
  private generation = 0;
  private disposed = false;
  private failed = false;
  private desiredPlaying = false;
  private running = false;
  private filling = false;
  private position = 0;
  private anchorTime = 0;
  private anchorPosition = 0;
  private scheduledEnd = 0;
  private duration = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastReport = -Infinity;
  private manifest: PlaybackManifest | null = null;
  private trackCount = 2;
  private playbackRate = 1;
  private ended = false;
  private readyWaiters = new Set<() => void>();
  private configurations = new Map<StemPlayback, TrackConfiguration>();
  private readonly master: GainNode;
  private vocalVolume = 1;

  constructor(
    private readonly context: AudioContext,
    private readonly onState: (state: WebAudioState) => void,
    private readonly onError: (error: unknown) => void,
  ) {
    let master: GainNode | undefined;
    try {
      master = context.createGain();
      master.connect(context.destination);
    } catch (error) {
      master?.disconnect();
      throw error;
    }
    this.master = master;
    context.addEventListener?.("statechange", this.onContextState);
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", this.onVisibility);
  }

  async load(manifest: PlaybackManifest, startTime = 0): Promise<void> {
    if (this.disposed) throw new Error("Web Audio player is disposed");
    if (!canUseWebAudioDecoder())
      throw new Error(
        "Trình duyệt chưa hỗ trợ phát nhạc bằng Web Audio. Vui lòng cập nhật trình duyệt.",
      );
    if (
      manifest.mode === "SING" &&
      Math.abs(
        manifest.instrumental.metadata.duration -
          manifest.vocal.metadata.duration,
      ) > 0.25
    ) {
      throw new Error("Stem durations do not match");
    }
    this.manifest = manifest;
    this.configurations.clear();
    this.duration =
      manifest.mode === "SING"
        ? manifest.instrumental.metadata.duration
        : manifest.main.metadata.duration;
    this.trackCount = manifest.mode === "SING" ? 2 : 1;
    if (!Number.isFinite(this.duration) || this.duration <= 0)
      throw new Error("Invalid stem duration");
    await this.seek(startTime);
  }

  async play(): Promise<void> {
    if (this.disposed) return;
    if (this.failed)
      throw new Error("Web Audio session failed; reload the stream");
    this.desiredPlaying = true;
    this.timer ??= setInterval(this.tick, 50);
    const resumed =
      this.context.state === "running"
        ? Promise.resolve()
        : this.context.resume();
    if (this.duration > 0 && this.currentTime >= this.duration) {
      void this.seek(0).catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          this.fail(error);
      });
    }
    await resumed;
    if (!this.disposed && this.desiredPlaying) {
      this.tick();
      this.report();
    }
  }

  pause(): void {
    this.desiredPlaying = false;
    this.stopTimer();
    this.stopAt(this.currentTime, true);
    this.report();
  }

  get currentTime(): number {
    return this.running
      ? Math.min(
          this.duration,
          this.scheduledEnd,
          this.anchorPosition +
            Math.max(0, this.context.currentTime - this.anchorTime) *
              this.playbackRate,
        )
      : this.position;
  }

  setVolume(value: number): void {
    this.master.gain.setTargetAtTime(
      Math.max(0, Math.min(1, value)),
      this.context.currentTime,
      0.015,
    );
  }

  setVocalVolume(value: number): void {
    this.vocalVolume = Math.max(0, Math.min(1, value));
    this.tracks[1]?.gain.gain.setTargetAtTime(
      this.vocalVolume,
      this.context.currentTime,
      0.015,
    );
  }

  setPlaybackRate(value: number): void {
    if (!Number.isFinite(value) || this.disposed) return;
    const rate = Math.max(0.5, Math.min(2, value));
    if (rate === this.playbackRate) return;
    this.stopAt(this.currentTime, true);
    this.playbackRate = rate;
    this.tick();
  }

  async seek(time: number): Promise<void> {
    if (this.disposed || !this.manifest || !Number.isFinite(time)) return;

    this.stopAt(Math.max(0, Math.min(time, this.duration)), true);
    this.ended = false;
    if (
      !this.failed &&
      !this.readyWaiters.size &&
      this.tracks.length === this.trackCount &&
      (this.position >= this.duration ||
        (this.tracks.every((track) =>
          track.spans.some(
            (span) => span.start <= this.position && span.end > this.position,
          ),
        ) &&
          this.bufferedEnd(this.position) - this.position >=
            Math.min(RESUME_BUFFER_SECONDS, this.duration - this.position)))
    ) {
      this.tick();
      this.report();
      return;
    }

    this.failed = false;
    this.controller.abort();
    this.closeTracks();
    this.controller = new AbortController();
    const signal = this.controller.signal;
    const generation = ++this.generation;
    this.filling = false;
    this.report();
    const created: Track[] = [];
    try {
      const prepare = async (stream: StemPlayback, vocal: boolean) => {
        const track = await this.prepareTrack(stream, vocal, signal);
        created.push(track);
        if (this.disposed || signal.aborted || generation !== this.generation) {
          this.closeTrack(track);
          throw new DOMException("Web Audio session replaced", "AbortError");
        }
        return track;
      };
      const tracks = await Promise.all(
        this.manifest.mode === "SING"
          ? [
              prepare(this.manifest.instrumental, false),
              prepare(this.manifest.vocal, true),
            ]
          : [prepare(this.manifest.main, false)],
      );
      if (this.disposed || signal.aborted || generation !== this.generation)
        return;
      this.tracks = tracks;
      const ready = this.waitForBuffered(signal);
      void this.fill(generation, signal);
      await ready;
      if (!signal.aborted) {
        this.report();
      }
    } catch (error) {
      for (const track of created) this.closeTrack(track);
      if (!signal.aborted && generation === this.generation && !this.disposed) {
        this.controller.abort();
        this.fail(error);
      }
      throw error;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.desiredPlaying = false;
    this.generation += 1;
    this.controller.abort();
    this.stopAt(this.currentTime);
    this.closeTracks();
    this.configurations.clear();
    this.stopTimer();
    this.master.disconnect();
    this.context.removeEventListener?.("statechange", this.onContextState);
    if (typeof document !== "undefined")
      document.removeEventListener("visibilitychange", this.onVisibility);
  }

  private async prepareTrack(
    stream: StemPlayback,
    vocal: boolean,
    signal: AbortSignal,
  ): Promise<Track> {
    const codecs = globalThis as unknown as AudioCodecs;
    let prepared = this.configurations.get(stream);
    if (!prepared) {
      const key = await importAesKey(stream.key);
      const iv = hexToBytes(stream.iv);
      const encrypted = await fetchWebAudioRange(
        stream.streamUrl,
        0,
        stream.metadata.initRange.end,
        signal,
      );
      const init = await decryptChunk(key, iv, encrypted, 0);
      if (signal.aborted)
        throw new DOMException("Web Audio fetch aborted", "AbortError");
      const configuration = readAacConfiguration(init);
      const support =
        await codecs.AudioDecoder.isConfigSupported?.(configuration);
      if (signal.aborted)
        throw new DOMException("Web Audio session replaced", "AbortError");
      if (support && !support.supported)
        throw new Error(
          "Trình duyệt không hỗ trợ bộ giải mã AAC cần thiết để phát nhạc.",
        );
      prepared = { key, iv, configuration };
      this.configurations.set(stream, prepared);
    }
    const { key, iv, configuration } = prepared;
    const gain = this.context.createGain();
    gain.gain.value = vocal ? this.vocalVolume : 1;
    gain.connect(this.master);
    let track: Track | undefined;
    try {
      track = {
        stream,
        key,
        iv,
        configuration,
        gain,
        pcm: new PcmAssembler(configuration.sampleRate, 0.15),
        spans: [],
        nextIndex: 0,
        initialEndIndex: 0,
        decodeFrom: this.position,
        closed: false,
        sources: 0,
        decoder: new codecs.AudioDecoder({
          output: (data) => {
            try {
              if (!track || signal.aborted || this.disposed) return;
              if (
                data.timestamp / 1e6 + data.numberOfFrames / data.sampleRate <=
                track.decodeFrom
              )
                return;
              const channels = Array.from(
                { length: data.numberOfChannels },
                (_, planeIndex) => {
                  const plane = new Float32Array(data.numberOfFrames);
                  data.copyTo(plane, { planeIndex, format: "f32-planar" });
                  return plane;
                },
              );
              const block = track.pcm.push({
                timestamp: data.timestamp,
                channels,
                sampleRate: data.sampleRate,
              });
              if (block) {
                this.appendPcm(track, block);
                this.tick();
              }
            } catch (error) {
              if (!signal.aborted) this.fail(error);
            } finally {
              data.close();
            }
          },
          error: (error) => {
            if (!signal.aborted) this.fail(error);
          },
        }),
      };
      track.decoder.configure(configuration);
      const segments = stream.metadata.segments;
      if (!segments.length) throw new Error("Audio segment index is empty");
      const target =
        this.position >= stream.metadata.duration
          ? segments.length
          : segmentAt(segments, this.position);
      track.nextIndex =
        target === segments.length
          ? target
          : segmentAt(
              segments,
              Math.max(0, this.position - AAC_SEEK_PREROLL_SECONDS),
            );
      track.initialEndIndex = target;
      return track;
    } catch (error) {
      if (track) this.closeTrack(track);
      else gain.disconnect();
      throw error;
    }
  }

  private async fetchNext(track: Track, signal: AbortSignal): Promise<void> {
    const segments = track.stream.metadata.segments.slice(
      track.nextIndex,
      Math.max(track.nextIndex, track.initialEndIndex) + 1,
    );
    if (!segments.length) return;

    const pending = segments
      .map(async (segment) => {
        const cipher = await fetchWebAudioRange(
          track.stream.streamUrl,
          segment.startByte,
          segment.startByte + segment.size - 1,
          signal,
        );

        const plain = await decryptChunk(
          track.key,
          track.iv,
          cipher,
          segment.startByte,
        );

        return plain;
      })
      .map((request) =>
        request.then(
          (plain) => ({ plain }),
          (error: unknown) => ({ error }),
        ),
      );
    const codecs = globalThis as unknown as AudioCodecs;
    for (let index = 0; index < segments.length; index += 1) {
      const result = await pending[index];
      if (signal.aborted || this.disposed) return;
      if ("error" in result) throw result.error;

      for (const packet of readAacPackets(
        result.plain,
        track.configuration,
        segments[index].startByte,
      )) {
        if (
          packet.timestamp + packet.duration <=
          (track.decodeFrom - AAC_SEEK_PREROLL_SECONDS) * 1e6
        ) {
          continue;
        }
        track.decoder.decode(
          new codecs.EncodedAudioChunk({ type: "key", ...packet }),
        );

        if (track.decoder.decodeQueueSize >= MAX_DECODE_QUEUE) {
          await this.waitForDecoder(
            track.decoder,
            signal,
            MAX_DECODE_QUEUE / 2,
          );
          if (signal.aborted || this.disposed) return;
        }
      }
      if (signal.aborted || this.disposed) return;
      track.nextIndex += 1;
    }
    if (track.nextIndex === track.stream.metadata.segments.length) {
      await track.decoder.flush();
      if (signal.aborted || this.disposed) return;
      const tail = track.pcm.flush();
      if (tail) this.appendPcm(track, tail);
    }
  }

  private appendPcm(track: Track, block: PcmBlock): void {
    const frames = block.channels[0].length;
    const start = block.startFrame / block.sampleRate;
    const buffer = this.context.createBuffer(
      block.channels.length,
      frames,
      block.sampleRate,
    );
    block.channels.forEach((plane, channel) =>
      buffer.copyToChannel(plane, channel),
    );
    track.spans.push({
      start,
      end: (block.startFrame + frames) / block.sampleRate,
      buffer,
      scheduledUntil: start,
    });

    for (const check of this.readyWaiters) check();
  }

  private waitForBuffered(signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.readyWaiters.delete(check);
        signal.removeEventListener("abort", abort);
      };
      const check = () => {
        if (
          this.bufferedEnd(this.position) - this.position >=
          Math.min(RESUME_BUFFER_SECONDS, this.duration - this.position)
        ) {
          cleanup();
          resolve();
        }
      };
      const abort = () => {
        cleanup();
        reject(new DOMException("Web Audio seek aborted", "AbortError"));
      };
      this.readyWaiters.add(check);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      else check();
    });
  }

  private waitForDecoder(
    decoder: Decoder,
    signal: AbortSignal,
    limit: number,
  ): Promise<void> {
    if (signal.aborted)
      return Promise.reject(new DOMException("Decoder aborted", "AbortError"));
    if (decoder.decodeQueueSize <= limit) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        decoder.removeEventListener("dequeue", onDequeue);
        signal.removeEventListener("abort", onAbort);
      };
      const onDequeue = () => {
        if (decoder.decodeQueueSize <= limit) {
          cleanup();
          resolve();
        }
      };
      const onAbort = () => {
        cleanup();
        reject(new DOMException("Decoder aborted", "AbortError"));
      };
      decoder.addEventListener("dequeue", onDequeue);
      signal.addEventListener("abort", onAbort, { once: true });
      onDequeue();
    });
  }

  private async fill(generation: number, signal: AbortSignal): Promise<void> {
    if (
      this.filling ||
      this.disposed ||
      generation !== this.generation ||
      this.tracks.length !== this.trackCount
    )
      return;
    this.filling = true;
    try {
      while (
        !signal.aborted &&
        !this.disposed &&
        generation === this.generation
      ) {
        const position = this.currentTime;
        const pending = this.tracks.filter((track) => {
          const segment = track.stream.metadata.segments[track.nextIndex];
          const ahead =
            typeof document !== "undefined" && document.hidden ? 60 : 30;
          return segment && segment.startTimeSec < position + ahead;
        });
        if (!pending.length) {
          if (
            this.readyWaiters.size &&
            this.tracks.every(
              (track) =>
                track.nextIndex >= track.stream.metadata.segments.length,
            ) &&
            this.bufferedEnd(this.position) - this.position <
              Math.min(RESUME_BUFFER_SECONDS, this.duration - this.position)
          ) {
            throw new Error(
              "Decoded audio does not cover the requested position",
            );
          }
          break;
        }
        await Promise.all(
          pending.map((track) => this.fetchNext(track, signal)),
        );
        if (!signal.aborted && !this.disposed && generation === this.generation)
          this.tick();
      }
    } catch (error) {
      if (!signal.aborted && generation === this.generation && !this.disposed)
        this.fail(error);
    } finally {
      if (generation === this.generation) this.filling = false;
    }
  }

  private trackEnd(track: Track, position: number): number {
    let end = position;
    for (const span of track.spans) {
      if (span.start > end + 0.002) break;
      if (span.end > end) end = span.end;
    }
    if (
      track.nextIndex >= track.stream.metadata.segments.length &&
      end >= track.stream.metadata.duration - 0.05
    ) {
      return this.duration;
    }
    return end;
  }

  private bufferedEnd(position = this.currentTime): number {
    return this.tracks.length === this.trackCount
      ? Math.min(...this.tracks.map((track) => this.trackEnd(track, position)))
      : position;
  }

  private schedule(): void {
    const pairedEnd = this.bufferedEnd();
    for (const track of this.tracks) {
      for (const span of track.spans) {
        const start = Math.max(this.anchorPosition, span.scheduledUntil);
        const end = Math.min(span.end, pairedEnd);
        if (start >= end) continue;
        const offset = start - span.start;
        const when =
          this.anchorTime + (start - this.anchorPosition) / this.playbackRate;
        if (when < this.context.currentTime) continue;
        const node = this.context.createBufferSource();
        node.buffer = span.buffer;
        node.playbackRate.value = this.playbackRate;
        const gain = this.context.createGain();
        node.connect(gain);
        gain.connect(track.gain);
        const finish = when + (end - start) / this.playbackRate;
        const fade = Math.min(FADE_SECONDS, (finish - when) / 2);
        if (start === this.anchorPosition) {
          gain.gain.setValueAtTime(0, when);
          gain.gain.linearRampToValueAtTime(1, when + fade);
        }
        if (end >= this.duration) {
          gain.gain.setValueAtTime(1, finish - fade);
          gain.gain.linearRampToValueAtTime(0, finish);
        }
        track.sources += 1;
        let released = false;
        const source: ScheduledSource = {
          node,
          gain,
          when,
          end: finish,
          fade: start === this.anchorPosition ? fade : 0,
          tailFade: end >= this.duration ? fade : 0,
          release: () => {
            if (released) return;
            released = true;
            node.onended = null;
            this.nodes.delete(source);
            this.retiring.delete(source);
            node.disconnect();
            gain.disconnect();
            track.sources--;
            if (track.closed && track.sources === 0) track.gain.disconnect();
            if (this.disposed && !this.nodes.size && !this.retiring.size)
              this.master.disconnect();
          },
        };
        this.nodes.add(source);
        node.onended = source.release;
        node.start(when, offset, end - start);
        span.scheduledUntil = end;
      }
    }
    this.scheduledEnd = pairedEnd;
  }

  private tick = (): void => {
    if (this.disposed || this.failed || !this.tracks.length) return;
    const position = this.currentTime;
    const end = this.bufferedEnd(position);
    if (this.running && position >= this.duration) {
      this.ended = true;
      this.desiredPlaying = false;
      this.stopTimer();
      this.stopAt(this.duration);
      this.report();
      return;
    } else if (this.running && position >= end - 0.005 && end < this.duration) {
      this.stopAt(Math.min(position, end), true);
    }
    if (
      this.running &&
      this.tracks.some((track) =>
        track.spans.some(
          (span) =>
            span.end > position &&
            Math.max(span.scheduledUntil, this.anchorPosition) < position &&
            span.scheduledUntil < Math.min(span.end, end),
        ),
      )
    ) {
      this.stopAt(position, true);
    }
    if (this.position >= this.duration) this.desiredPlaying = false;
    if (
      this.desiredPlaying &&
      !this.running &&
      this.context.state === "running" &&
      end - this.position >=
        Math.min(RESUME_BUFFER_SECONDS, this.duration - this.position)
    ) {
      this.anchorTime = this.context.currentTime + 0.05;
      this.anchorPosition = this.position;
      this.running = true;
    }
    if (this.running) this.schedule();
    for (const track of this.tracks)
      track.spans = track.spans.filter((span) => span.end >= position - 2);
    if (!this.filling && end - position < 15)
      void this.fill(this.generation, this.controller.signal);
    if (this.context.currentTime - this.lastReport >= 0.25) this.report();
  };

  private stopTimer(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private stopAt(position: number, smooth = false): void {
    smooth = smooth && this.context.state === "running";
    this.position = position;
    this.scheduledEnd = position;
    this.running = false;
    const now = this.context.currentTime;
    for (const source of this.nodes.values()) {
      this.nodes.delete(source);
      if (smooth && source.when < now && source.end > now) {
        const level = Math.min(
          1,
          source.fade ? Math.max(0, (now - source.when) / source.fade) : 1,
          source.tailFade
            ? Math.max(0, (source.end - now) / source.tailFade)
            : 1,
        );
        const stopTime = Math.min(now + FADE_SECONDS, source.end);
        source.gain.gain.cancelScheduledValues(now);
        source.gain.gain.setValueAtTime(level, now);
        source.gain.gain.linearRampToValueAtTime(0, stopTime);
        source.node.stop(stopTime);
        this.retiring.add(source);
      } else {
        source.node.stop();
        source.release();
      }
    }
    if (!smooth)
      for (const source of this.retiring) {
        source.node.stop();
        source.release();
      }
    for (const track of this.tracks)
      for (const span of track.spans) span.scheduledUntil = span.start;
  }

  private report(): void {
    this.lastReport = this.context.currentTime;
    this.onState({
      position: this.currentTime,
      duration: this.duration,
      playing: this.running,
      waiting: this.desiredPlaying && !this.running,
      bufferedEnd: this.bufferedEnd(),
      ended: this.ended,
    });
  }

  private closeTrack(track: Track): void {
    if (track.closed) return;
    track.closed = true;
    try {
      track.decoder.close();
    } catch {
      /* Already closed by a decoder error. */
    }
    if (!track.sources) track.gain.disconnect();
    track.pcm.clear();
    track.spans.length = 0;
  }

  private closeTracks(): void {
    for (const track of this.tracks) this.closeTrack(track);
    this.tracks = [];
  }

  private fail = (error: unknown): void => {
    if (this.disposed || this.failed) return;
    this.failed = true;
    this.stopTimer();

    this.desiredPlaying = false;
    this.stopAt(this.currentTime, true);
    this.controller.abort();
    this.closeTracks();
    this.report();
    this.onError(error);
  };

  private onContextState = (): void => {
    if (this.disposed) return;
    if (this.context.state === "closed") {
      this.fail(new Error("AudioContext closed unexpectedly"));
      return;
    }
    if (this.context.state !== "running" && this.running)
      this.stopAt(this.currentTime);
    if (this.context.state === "running") this.tick();
    this.report();
  };

  private onVisibility = (): void => {
    if (this.disposed || !this.desiredPlaying) return;
    void this.fill(this.generation, this.controller.signal);
    this.tick();
  };
}

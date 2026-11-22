import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebAudioPlayer } from "./web-audio-player";
import { readAacConfiguration, readAacPackets } from "./aac-demuxer";
import { fetchRange } from "./fetcher";
import type { PlaybackManifest, StreamMetadata } from "./types";

vi.mock("./crypto", () => ({
  importAesKey: vi.fn(async () => ({})),
  hexToBytes: vi.fn(() => new Uint8Array(16)),
  decryptChunk: vi.fn(async (_key, _iv, bytes) => bytes),
}));
vi.mock("./fetcher", () => ({ fetchRange: vi.fn() }));

const file = readFileSync(
  new URL("./fixtures/aac-stereo-fragments.mp4", import.meta.url),
);
const bytes = file.buffer.slice(
  file.byteOffset,
  file.byteOffset + file.byteLength,
) as ArrayBuffer;
const configuration = readAacConfiguration(bytes);
const segments: StreamMetadata["segments"] = [];
const view = new DataView(bytes);
let initEnd = 0;
for (let offset = 0; offset < bytes.byteLength; ) {
  const size = view.getUint32(offset);
  const type = String.fromCharCode(...new Uint8Array(bytes, offset + 4, 4));
  if (type === "moov") initEnd = offset + size - 1;
  if (type === "moof") {
    const totalSize = size + view.getUint32(offset + size);
    const packets = readAacPackets(
      bytes.slice(offset, offset + totalSize),
      configuration,
      offset,
    );
    const last = packets[packets.length - 1];
    segments.push({
      startByte: offset,
      size: totalSize,
      startTimeSec: packets[0].timestamp / 1e6,
      duration: Math.round(
        ((last.timestamp + last.duration - packets[0].timestamp) *
          configuration.timescale) /
          1e6,
      ),
    });
  }
  offset += size;
}

type Packet = { timestamp: number };
type Output = {
  timestamp: number;
  numberOfFrames: number;
  numberOfChannels: number;
  sampleRate: number;
  copyTo: (destination: Float32Array) => void;
  close: () => void;
};
class LaggingDecoder extends EventTarget {
  static instances: LaggingDecoder[] = [];
  decodeQueueSize = 0;
  pending: Packet | null = null;
  closed = false;
  timestamps: number[] = [];
  maxQueue = 0;
  constructor(private callbacks: { output: (data: Output) => void }) {
    super();
    LaggingDecoder.instances.push(this);
  }
  configure = vi.fn();
  decode(packet: Packet) {
    this.timestamps.push(packet.timestamp);
    this.decodeQueueSize += 1;
    this.maxQueue = Math.max(this.maxQueue, this.decodeQueueSize);
    queueMicrotask(() => {
      if (!this.closed) {
        if (this.pending) this.emit(this.pending);
        this.pending = packet;
      }
      this.decodeQueueSize -= 1;
      this.dispatchEvent(new Event("dequeue"));
    });
  }
  private emit(packet: Packet) {
    this.callbacks.output({
      timestamp: packet.timestamp,
      numberOfFrames: 1024,
      numberOfChannels: 2,
      sampleRate: 48_000,
      copyTo: (destination) => destination.fill(0.25),
      close: vi.fn(),
    });
  }
  flush = vi.fn(async () => {
    while (this.decodeQueueSize)
      await new Promise<void>((resolve) =>
        this.addEventListener("dequeue", () => resolve(), { once: true }),
      );
    if (this.pending && !this.closed) this.emit(this.pending);
    this.pending = null;
  });
  close = vi.fn(() => {
    this.closed = true;
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("continuous AAC decoding", () => {
  it("disconnects the new track gain if decoder construction fails", async () => {
    vi.stubGlobal(
      "AudioDecoder",
      class {
        constructor() {
          throw new Error("Decoder unavailable");
        }
      },
    );
    vi.stubGlobal("EncodedAudioChunk", class {});
    vi.mocked(fetchRange).mockImplementation(async (_url, start, end) =>
      bytes.slice(start, end + 1),
    );
    const gains: Array<{ disconnect: ReturnType<typeof vi.fn> }> = [];
    const context = {
      currentTime: 0,
      sampleRate: 48_000,
      state: "suspended",
      destination: {},
      createGain: () => {
        const gain = {
          gain: { value: 1 },
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
        gains.push(gain);
        return gain;
      },
    };
    const metadata = {
      duration: 6,
      timescale: 48_000,
      initRange: { start: 0, end: initEnd },
      segments,
    } as StreamMetadata;
    const failure = vi.fn();
    const player = new WebAudioPlayer(
      context as unknown as AudioContext,
      vi.fn(),
      failure,
    );
    await expect(
      player.load({
        mode: "STANDARD",
        main: { streamUrl: "fixture", key: "test", iv: "test", metadata },
      }),
    ).rejects.toThrow("Decoder unavailable");
    expect(gains).toHaveLength(2);
    expect(gains[1].disconnect).toHaveBeenCalledTimes(1);
    expect(failure).toHaveBeenCalledTimes(1);
    player.dispose();
    expect(gains[1].disconnect).toHaveBeenCalledTimes(1);
  });

  it("reports an unsupported AAC configuration before creating a decoder", async () => {
    LaggingDecoder.instances = [];
    const support = vi.fn(async () => ({ supported: false }));
    vi.stubGlobal(
      "AudioDecoder",
      class extends LaggingDecoder {
        static isConfigSupported = support;
      },
    );
    vi.stubGlobal("EncodedAudioChunk", class {});
    vi.mocked(fetchRange).mockImplementation(async (_url, start, end) =>
      bytes.slice(start, end + 1),
    );
    const context = {
      currentTime: 0,
      sampleRate: 48_000,
      state: "suspended",
      destination: {},
      createGain: () => ({
        gain: { value: 1 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      }),
    };
    const metadata = {
      duration: 6,
      timescale: 48_000,
      initRange: { start: 0, end: initEnd },
      segments,
    } as StreamMetadata;
    const failure = vi.fn();
    const player = new WebAudioPlayer(
      context as unknown as AudioContext,
      vi.fn(),
      failure,
    );
    await expect(
      player.load({
        mode: "STANDARD",
        main: { streamUrl: "fixture", key: "test", iv: "test", metadata },
      }),
    ).rejects.toThrow("AAC");
    expect(support).toHaveBeenCalledTimes(1);
    expect(LaggingDecoder.instances).toHaveLength(0);
    expect(failure).toHaveBeenCalledTimes(1);
    player.dispose();
  });

  it("fails an uncovered EOF seek instead of keeping it pending forever", async () => {
    vi.useFakeTimers();
    LaggingDecoder.instances = [];
    vi.stubGlobal("AudioDecoder", LaggingDecoder);
    vi.stubGlobal("EncodedAudioChunk", class {});
    vi.mocked(fetchRange).mockImplementation(async (_url, start, end) =>
      bytes.slice(start, end + 1),
    );
    const context = {
      currentTime: 0,
      sampleRate: 48_000,
      state: "suspended",
      destination: {},
      createGain: () => ({
        gain: { value: 1 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      }),
    };
    const metadata = {
      duration: 8,
      timescale: 48_000,
      initRange: { start: 0, end: initEnd },
      segments,
    } as StreamMetadata;
    const stream = { streamUrl: "fixture", key: "test", iv: "test", metadata };
    const failure = vi.fn();
    const player = new WebAudioPlayer(
      context as unknown as AudioContext,
      vi.fn(),
      failure,
    );
    await expect(
      player.load({ mode: "STANDARD", main: stream }, 7),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(failure).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Decoded audio does not cover the requested position",
      }),
    );
    expect(vi.getTimerCount()).toBe(0);
    player.dispose();
    for (const decoder of LaggingDecoder.instances)
      expect(decoder.close).toHaveBeenCalledTimes(1);
  });

  it.each(["SING", "STANDARD"] as const)(
    "keeps %s PCM at its original sample rate across decoding and seeks",
    async (mode) => {
      vi.useFakeTimers();
      LaggingDecoder.instances = [];
      vi.stubGlobal("AudioDecoder", LaggingDecoder);
      vi.stubGlobal(
        "EncodedAudioChunk",
        class {
          constructor(packet: Packet) {
            Object.assign(this, packet);
          }
        },
      );
      vi.mocked(fetchRange).mockImplementation(async (_url, start, end) =>
        bytes.slice(start, end + 1),
      );
      const context = {
        currentTime: 0,
        sampleRate: 44_100,
        state: "suspended",
        destination: {},
        createGain: () => ({
          gain: { value: 1 },
          connect: vi.fn(),
          disconnect: vi.fn(),
        }),
        createBuffer: (
          channels: number,
          frames: number,
          sampleRate: number,
        ) => {
          const planes = Array.from(
            { length: channels },
            () => new Float32Array(frames),
          );
          return {
            duration: frames / sampleRate,
            length: frames,
            sampleRate,
            copyToChannel: (data: Float32Array, index: number) =>
              planes[index].set(data),
            getChannelData: (index: number) => planes[index],
          };
        },
      };
      const metadata = {
        duration: 6,
        timescale: 48_000,
        initRange: { start: 0, end: initEnd },
        segments,
      } as StreamMetadata;
      const stream = {
        streamUrl: "fixture",
        key: "test",
        iv: "test",
        metadata,
      };
      const failure = vi.fn();
      const player = new WebAudioPlayer(
        context as unknown as AudioContext,
        vi.fn(),
        failure,
      );
      try {
        const manifest = (
          mode === "SING"
            ? { mode, instrumental: stream, vocal: stream }
            : { mode, main: stream }
        ) as PlaybackManifest;
        await player.load(manifest);
        for (let turn = 0; turn < 50; turn += 1) await Promise.resolve();
        expect(failure).not.toHaveBeenCalled();
        expect(segments.length).toBeGreaterThan(2);
        expect(LaggingDecoder.instances).toHaveLength(mode === "SING" ? 2 : 1);
        for (const decoder of LaggingDecoder.instances)
          expect(decoder.flush).toHaveBeenCalledTimes(1);
        const tracks = (
          player as unknown as {
            tracks: Array<{
              spans: Array<{ start: number; end: number; buffer: AudioBuffer }>;
            }>;
          }
        ).tracks;
        const sampleCount =
          readAacPackets(bytes, configuration, 0).length * 1024;
        for (const track of tracks) {
          expect(track.spans.length).toBeGreaterThan(2);
          expect(
            track.spans.every((span) => span.buffer.sampleRate === 48_000),
          ).toBe(true);
          expect(
            track.spans.reduce((sum, span) => sum + span.buffer.length, 0),
          ).toBe(sampleCount);
          for (let index = 1; index < track.spans.length; index += 1) {
            expect(track.spans[index].start).toBeCloseTo(
              track.spans[index - 1].end,
              12,
            );
            expect(track.spans[index].buffer.getChannelData(0)[0]).toBe(0.25);
          }
        }
        const callsBeforeSeek = vi.mocked(fetchRange).mock.calls.length;
        const decodersBeforeSeek = LaggingDecoder.instances.length;
        await player.seek(3);
        expect(fetchRange).toHaveBeenCalledTimes(callsBeforeSeek);
        expect(LaggingDecoder.instances).toHaveLength(decodersBeforeSeek);

        for (const track of tracks) track.spans.length = 0;
        const seekCallsStart = vi.mocked(fetchRange).mock.calls.length;
        const seeking = player.seek(3);
        void seeking.catch(() => {});
        for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
        const seekCalls = vi
          .mocked(fetchRange)
          .mock.calls.slice(seekCallsStart);
        expect(seekCalls.filter((call) => call[1] === 0)).toHaveLength(0);
        expect(
          seekCalls.filter((call) => call[1] === segments[0].startByte),
        ).toHaveLength(0);
        expect(
          seekCalls.filter((call) => call[1] === segments[1].startByte),
        ).toHaveLength(mode === "SING" ? 2 : 1);
        await seeking;
        for (let turn = 0; turn < 50; turn += 1) await Promise.resolve();
        expect(failure).not.toHaveBeenCalled();
        const newTracks = (player as unknown as { tracks: typeof tracks })
          .tracks;
        for (const track of newTracks) {
          expect(track.spans[0].start).toBeLessThanOrEqual(3);
          expect(track.spans[0].end).toBeGreaterThan(3.1);
          expect(track.spans[0].end - track.spans[0].start).toBeLessThan(0.2);
          for (let index = 1; index < track.spans.length; index += 1) {
            expect(track.spans[index].start).toBeCloseTo(
              track.spans[index - 1].end,
              12,
            );
          }
        }
        for (const decoder of LaggingDecoder.instances.slice(
          decodersBeforeSeek,
        )) {
          expect(decoder.timestamps[0]).toBeGreaterThan(2_720_000);
          expect(decoder.timestamps[0]).toBeLessThanOrEqual(2_750_000);
          expect(decoder.maxQueue).toBeLessThanOrEqual(64);
        }
        for (const track of newTracks) track.spans.length = 0;
        const crossingStart = LaggingDecoder.instances.length;
        const beforeCrossing = vi.mocked(fetchRange).mock.calls.length;
        await player.seek(2.1);
        for (let turn = 0; turn < 50; turn += 1) await Promise.resolve();
        expect(failure).not.toHaveBeenCalled();
        const crossingCalls = vi
          .mocked(fetchRange)
          .mock.calls.slice(beforeCrossing);
        expect(
          crossingCalls.filter((call) => call[1] === segments[0].startByte),
        ).toHaveLength(mode === "SING" ? 2 : 1);
        expect(
          crossingCalls.filter((call) => call[1] === segments[1].startByte),
        ).toHaveLength(mode === "SING" ? 2 : 1);
        for (const decoder of LaggingDecoder.instances.slice(crossingStart)) {
          expect(decoder.timestamps[0]).toBeGreaterThan(1_820_000);
          expect(decoder.timestamps[0]).toBeLessThanOrEqual(1_850_000);
          expect(decoder.maxQueue).toBeLessThanOrEqual(64);
        }
      } finally {
        player.dispose();
      }
      for (const decoder of LaggingDecoder.instances)
        expect(decoder.close).toHaveBeenCalledTimes(1);
    },
  );
});

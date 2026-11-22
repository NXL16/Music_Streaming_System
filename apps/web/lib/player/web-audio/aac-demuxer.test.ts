import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readAacConfiguration, readAacPackets } from "./aac-demuxer";

const fixture = readFileSync(
  new URL("./fixtures/aac-stereo-fragments.mp4", import.meta.url),
);
const data = fixture.buffer.slice(
  fixture.byteOffset,
  fixture.byteOffset + fixture.byteLength,
) as ArrayBuffer;

describe("AAC fragmented MP4 demuxing", () => {
  it("extracts the real FFmpeg AAC-LC configuration", () => {
    const configuration = readAacConfiguration(data);
    expect(configuration.codec).toBe("mp4a.40.2");
    expect(configuration.sampleRate).toBe(48_000);
    expect(configuration.numberOfChannels).toBe(2);
    expect(configuration.timescale).toBe(48_000);
    expect(configuration.description.length).toBeGreaterThanOrEqual(2);
    expect(configuration.description[0] >>> 3).toBe(2);
  });

  it("extracts every AAC packet with monotonic timestamps across fragment boundaries", () => {
    const packets = readAacPackets(data, readAacConfiguration(data), 0);
    expect(packets.length).toBeGreaterThan(280);
    expect(packets[0].timestamp).toBe(0);
    for (let index = 1; index < packets.length; index += 1) {
      expect(
        packets[index].timestamp - packets[index - 1].timestamp,
      ).toBeCloseTo(21_333, -1);
      expect(packets[index].data.length).toBeGreaterThan(0);
    }
    const last = packets[packets.length - 1];
    expect((last.timestamp + last.duration) / 1e6).toBeCloseTo(6.02, 1);
  });

  it("preserves timestamps and payload when loading individual byte-range fragments", () => {
    const full = readAacPackets(data, readAacConfiguration(data), 0);
    const fromRanges = [];
    const view = new DataView(data);
    for (let offset = 0; offset < data.byteLength; ) {
      const size = view.getUint32(offset);
      const type = String.fromCharCode(...new Uint8Array(data, offset + 4, 4));
      if (type === "moof") {
        const mdatSize = view.getUint32(offset + size);
        fromRanges.push(
          ...readAacPackets(
            data.slice(offset, offset + size + mdatSize),
            readAacConfiguration(data),
            offset,
          ),
        );
      }
      offset += size;
    }
    expect(fromRanges).toEqual(full);
  });

  it("rejects truncated or corrupt boxes instead of decoding arbitrary bytes", () => {
    expect(() => readAacConfiguration(data.slice(0, 20))).toThrow();
    expect(() =>
      readAacPackets(
        data.slice(0, data.byteLength - 1000),
        readAacConfiguration(data),
        0,
      ),
    ).toThrow();
    const invalid = data.slice(0);
    new DataView(invalid).setUint32(0, 4);
    expect(() => readAacConfiguration(invalid)).toThrow("Invalid MP4 box size");
  });
});

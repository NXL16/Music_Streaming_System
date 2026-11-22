import { describe, expect, it } from "vitest";
import { PcmAssembler, type PcmBlock } from "./pcm-assembler";

describe("continuous PCM assembly", () => {
  it("emits a small startup block, then returns to large continuous blocks", () => {
    const pcm = new PcmAssembler(48_000, 0.15);
    const blocks: PcmBlock[] = [];
    for (let frame = 0; frame < 120 * 1024; frame += 1024) {
      const channel = Float32Array.from(
        { length: 1024 },
        (_, index) => frame + index,
      );
      const block = pcm.push({
        timestamp: Math.round((frame * 1e6) / 48_000),
        sampleRate: 48_000,
        channels: [channel],
      });
      if (block) blocks.push(block);
    }
    const tail = pcm.flush();
    if (tail) blocks.push(tail);
    expect(blocks[0].channels[0].length).toBe(8 * 1024);
    expect(blocks[1].channels[0].length).toBe(94 * 1024);
    let cursor = 0;
    for (const block of blocks) {
      expect(block.startFrame).toBe(cursor);
      for (const sample of block.channels[0]) expect(sample).toBe(cursor++);
    }
    expect(cursor).toBe(120 * 1024);
  });

  it.each([44_100, 48_000])(
    "keeps every sample continuous across AAC and buffer boundaries at %s Hz",
    (sampleRate) => {
      const pcm = new PcmAssembler(sampleRate);
      const blocks: PcmBlock[] = [];
      let frame = 0;
      for (let packet = 0; packet < 300; packet += 1) {
        const channel = Float32Array.from({ length: 1024 }, (_, index) =>
          Math.sin((frame + index) * 0.071),
        );
        const block = pcm.push({
          timestamp: Math.round((frame * 1e6) / sampleRate),
          sampleRate,
          channels: [channel, channel.slice()],
        });
        if (block) blocks.push(block);
        frame += 1024;
      }
      const tail = pcm.flush();
      if (tail) blocks.push(tail);
      let cursor = 0;
      for (const block of blocks) {
        expect(block.startFrame).toBe(cursor);
        for (let index = 0; index < block.channels[0].length; index += 1) {
          if (
            Math.abs(
              block.channels[0][index] -
                Math.fround(Math.sin((cursor + index) * 0.071)),
            ) > 1e-7
          ) {
            throw new Error(`PCM sample changed at frame ${cursor + index}`);
          }
        }
        expect(block.channels[1]).toEqual(block.channels[0]);
        cursor += block.channels[0].length;
      }
      expect(cursor).toBe(300 * 1024);
      expect(pcm.flush()).toBeNull();
    },
  );

  it("rejects timestamp gaps and overlaps rather than filling silence or overwriting samples", () => {
    for (const timestamp of [0, 30_000]) {
      const pcm = new PcmAssembler(48_000);
      pcm.push({
        timestamp: 0,
        sampleRate: 48_000,
        channels: [new Float32Array(1024)],
      });
      expect(() =>
        pcm.push({
          timestamp,
          sampleRate: 48_000,
          channels: [new Float32Array(1024)],
        }),
      ).toThrow("PCM discontinuity");
    }
  });
});

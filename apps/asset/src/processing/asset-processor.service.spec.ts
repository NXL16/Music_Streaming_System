import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { AssetProcessorService } from "./asset-processor.service";
import { artworkPaletteFromColor } from "./artwork-theme";

void test("artwork text palette follows the same contrast mode as the page", () => {
  assert.equal(artworkPaletteFromColor("#ff0000").textColor1, "000000");
  assert.equal(artworkPaletteFromColor("#003360").textColor1, "ffffff");
});

void test("bounded async mapping preserves order without unbounded fan-out", async () => {
  const processor = new AssetProcessorService(
    {} as never,
    { get: () => undefined } as never,
  );
  let active = 0;
  let peakActive = 0;

  const outputs = await processor["mapWithConcurrency"](
    [1, 2, 3, 4, 5],
    2,
    async (input) => {
      active += 1;
      peakActive = Math.max(peakActive, active);
      await Promise.resolve();
      active -= 1;
      return input * 10;
    },
  );

  assert.equal(peakActive, 2);
  assert.deepEqual(outputs, [10, 20, 30, 40, 50]);
});

void test("hero extension preserves a chromatic dark edge but keeps neutral black", async () => {
  const processor = new AssetProcessorService(
    {} as never,
    { get: () => undefined } as never,
  );
  const buildExtension = async (color: string) =>
    processor["buildHeroExtension"](
      await sharp({
        create: { width: 100, height: 100, channels: 3, background: color },
      })
        .png()
        .toBuffer(),
      100,
      100,
      34,
      48,
    );

  const [neutralBlack, darkBlue] = await Promise.all([
    buildExtension("#050505"),
    buildExtension("#11131b"),
  ]);

  assert.equal(neutralBlack.overlap, 0);
  assert.ok(darkBlue.overlap > 0);
});

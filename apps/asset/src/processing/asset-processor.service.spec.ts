import assert from "node:assert/strict";
import test from "node:test";
import { AssetProcessorService } from "./asset-processor.service";

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

import { mapWithConcurrency } from './concurrency';

describe('mapWithConcurrency', () => {
  it('preserves result order while bounding in-flight work', async () => {
    let active = 0;
    let peakActive = 0;

    const result = await mapWithConcurrency(
      [1, 2, 3, 4, 5],
      2,
      async (value) => {
        active += 1;
        peakActive = Math.max(peakActive, active);
        await Promise.resolve();
        active -= 1;
        return value * 2;
      },
    );

    expect(peakActive).toBe(2);
    expect(result).toEqual([2, 4, 6, 8, 10]);
  });

  it('rejects an invalid concurrency value before scheduling work', async () => {
    await expect(
      mapWithConcurrency([1], 0, (value) => Promise.resolve(value)),
    ).rejects.toThrow('maxConcurrency must be a positive integer');
  });
});

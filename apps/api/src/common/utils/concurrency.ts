/**
 * Maps an input list with a fixed amount of in-flight work. Results retain the
 * input order, while a failure stops scheduling work that has not started yet.
 */
export async function mapWithConcurrency<Input, Output>(
  inputs: readonly Input[],
  maxConcurrency: number,
  mapper: (input: Input, index: number) => Promise<Output>,
): Promise<Output[]> {
  if (!Number.isSafeInteger(maxConcurrency) || maxConcurrency < 1) {
    throw new RangeError('maxConcurrency must be a positive integer');
  }

  const outputs = new Array<Output>(inputs.length);
  let nextIndex = 0;
  let stopped = false;
  const worker = async (): Promise<void> => {
    while (!stopped) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= inputs.length) return;

      try {
        outputs[index] = await mapper(inputs[index], index);
      } catch (error) {
        stopped = true;
        throw error;
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(maxConcurrency, inputs.length) },
      () => worker(),
    ),
  );
  return outputs;
}

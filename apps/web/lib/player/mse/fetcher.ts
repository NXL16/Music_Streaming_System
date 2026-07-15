export async function fetchRange(
  url: string,
  start: number,
  end: number,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const response = await fetch(url, {
    headers: { Range: `bytes=${start}-${end}` },
    signal,
  });

  if (!response.ok && response.status !== 206) {
    throw new Error(`Range fetch failed: ${response.status}`);
  }

  return response.arrayBuffer();
}

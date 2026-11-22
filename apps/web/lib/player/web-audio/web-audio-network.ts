import { fetchRange, RangeFetchResponseError } from "./fetcher";

function waitForRetry(delay: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", aborted);
      globalThis.removeEventListener?.("online", resumed);
    };
    const resumed = () => {
      cleanup();
      resolve();
    };
    const aborted = () => {
      cleanup();
      reject(new DOMException("Web Audio fetch aborted", "AbortError"));
    };
    const timer = setTimeout(resumed, delay);
    signal.addEventListener("abort", aborted, { once: true });
    globalThis.addEventListener?.("online", resumed, { once: true });
    if (signal.aborted) aborted();
  });
}

export async function fetchWebAudioRange(
  url: string,
  start: number,
  end: number,
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetchRange(url, start, end, signal);
    } catch (error) {
      if (
        signal.aborted ||
        (error instanceof RangeFetchResponseError && !error.retryable)
      )
        throw error;
      await waitForRetry(
        Math.min(8000, 250 * 2 ** Math.min(attempt, 5)),
        signal,
      );
    }
  }
}

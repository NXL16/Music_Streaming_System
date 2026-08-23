const RETRYABLE_RANGE_FETCH_ATTEMPTS = 2;
const RANGE_FETCH_RETRY_DELAY_MS = 100;

class RangeFetchResponseError extends Error {
  constructor(
    readonly retryable: boolean,
    status: number,
  ) {
    super(`Range fetch failed: ${status}`);
  }
}

function hasExpectedContentRange(
  contentRange: string | null,
  start: number,
  end: number,
): boolean {
  // The player decrypts based on `start`, so accepting a 200 response (or a
  // mismatched 206 response) corrupts the fragment before it reaches MSE.
  // The total file length is deliberately not constrained: a representation
  // can be replaced only between playback sessions, while this request must
  // still describe exactly the bytes we asked to decrypt.
  return new RegExp(`^bytes\\s+${start}-${end}/\\d+$`, "i").test(
    contentRange?.trim() ?? "",
  );
}

function waitForRetry(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Range fetch aborted", "AbortError"));
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, RANGE_FETCH_RETRY_DELAY_MS);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Range fetch aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function fetchRange(
  url: string,
  start: number,
  end: number,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  let lastError: unknown;

  for (
    let attempt = 0;
    attempt < RETRYABLE_RANGE_FETCH_ATTEMPTS;
    attempt += 1
  ) {
    try {
      const response = await fetch(url, {
        headers: { Range: `bytes=${start}-${end}` },
        signal,
      });

      if (
        response.status === 206 &&
        hasExpectedContentRange(response.headers.get("Content-Range"), start, end)
      ) {
        const body = await response.arrayBuffer();
        if (body.byteLength === end - start + 1) return body;
      }

      // A 200 response to a byte-range request is invalid for this player,
      // even if it is technically successful HTTP. Treat it as retryable: it
      // is commonly caused by an edge cache temporarily serving a non-range
      // representation.
      throw new RangeFetchResponseError(
        response.status === 200 || response.status >= 500 || response.status === 206,
        response.status,
      );
    } catch (error) {
      if (
        signal?.aborted ||
        (error instanceof RangeFetchResponseError && !error.retryable)
      ) {
        throw error;
      }
      lastError = error;
    }

    if (attempt + 1 < RETRYABLE_RANGE_FETCH_ATTEMPTS) {
      await waitForRetry(signal);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Range fetch failed after retry");
}

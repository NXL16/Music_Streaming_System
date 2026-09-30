const RETRYABLE_RANGE_FETCH_ATTEMPTS = 2;
const RANGE_FETCH_RETRY_DELAY_MS = 150;
// Playback ranges are small. A response that trickles bytes for several
// seconds is not useful once the audio buffer is draining, so give every
// attempt one short, absolute deadline instead of accepting slow progress
// indefinitely.
const RANGE_FETCH_HEADER_TIMEOUT_MS = 2_000;
const RANGE_FETCH_BODY_STALL_TIMEOUT_MS = 1_500;
const RANGE_FETCH_TOTAL_TIMEOUT_MS = 4_000;

type RangeFetchTimeoutReason = "header" | "body-stall" | "total";

class RangeFetchResponseError extends Error {
  constructor(
    readonly retryable: boolean,
    status: number,
  ) {
    super(`Range fetch failed: ${status}`);
  }
}

class RangeFetchTimeoutError extends Error {
  constructor(reason: RangeFetchTimeoutReason) {
    super(`Range fetch timed out: ${reason}`);
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

function waitForRetry(
  signal: AbortSignal | undefined,
  attempt: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Range fetch aborted", "AbortError"));
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, RANGE_FETCH_RETRY_DELAY_MS * (attempt + 1));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Range fetch aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function readRangeBody(
  response: Response,
  expectedLength: number,
  resetBodyStallTimeout: () => void,
): Promise<ArrayBuffer> {
  if (!response.body) {
    // Fetch streams are available in every browser we support for MSE/MMS.
    // Do not fall back to arrayBuffer(): that would make a body stall
    // invisible and reintroduce the unbounded wait this guard prevents.
    throw new Error("Range response body is unavailable");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;

      chunks.push(value);
      receivedLength += value.byteLength;
      resetBodyStallTimeout();
    }
  } finally {
    reader.releaseLock();
  }

  if (receivedLength !== expectedLength) {
    throw new RangeFetchResponseError(true, response.status);
  }

  const result = new Uint8Array(receivedLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result.buffer;
}

async function fetchRangeAttempt(
  url: string,
  start: number,
  end: number,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const controller = new AbortController();
  let timeoutReason: RangeFetchTimeoutReason | null = null;
  const abortForParent = () => controller.abort();
  const abortForTimeout = (reason: RangeFetchTimeoutReason) => {
    timeoutReason = reason;
    controller.abort();
  };

  if (signal?.aborted) abortForParent();
  signal?.addEventListener("abort", abortForParent, { once: true });
  const totalTimeout = setTimeout(
    () => abortForTimeout("total"),
    RANGE_FETCH_TOTAL_TIMEOUT_MS,
  );
  let headerTimeout: ReturnType<typeof setTimeout> | null = setTimeout(
    () => abortForTimeout("header"),
    RANGE_FETCH_HEADER_TIMEOUT_MS,
  );
  let bodyStallTimeout: ReturnType<typeof setTimeout> | null = null;
  const resetBodyStallTimeout = () => {
    if (bodyStallTimeout) clearTimeout(bodyStallTimeout);
    bodyStallTimeout = setTimeout(
      () => abortForTimeout("body-stall"),
      RANGE_FETCH_BODY_STALL_TIMEOUT_MS,
    );
  };

  try {
    const response = await fetch(url, {
      headers: { Range: `bytes=${start}-${end}` },
      signal: controller.signal,
    });
    if (headerTimeout) {
      clearTimeout(headerTimeout);
      headerTimeout = null;
    }

    if (
      response.status === 206 &&
      hasExpectedContentRange(response.headers.get("Content-Range"), start, end)
    ) {
      resetBodyStallTimeout();
      return await readRangeBody(
        response,
        end - start + 1,
        resetBodyStallTimeout,
      );
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
    if (signal?.aborted) throw error;
    if (timeoutReason) throw new RangeFetchTimeoutError(timeoutReason);
    throw error;
  } finally {
    clearTimeout(totalTimeout);
    if (headerTimeout) clearTimeout(headerTimeout);
    if (bodyStallTimeout) clearTimeout(bodyStallTimeout);
    signal?.removeEventListener("abort", abortForParent);
  }
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
      return await fetchRangeAttempt(url, start, end, signal);
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
      await waitForRetry(signal, attempt);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Range fetch failed after retry");
}

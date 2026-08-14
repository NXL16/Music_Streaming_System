import axios, { type AxiosError } from "axios";

const SAFE_READ_METHODS = new Set(["GET", "HEAD"]);
const TRANSIENT_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

export const MAX_READ_RETRIES = 2;
export type RetryAbortSignal = Pick<
  AbortSignal,
  "aborted" | "addEventListener" | "removeEventListener"
>;

export function isRequestCanceled(error: unknown) {
  return (
    axios.isCancel(error) ||
    (axios.isAxiosError(error) && error.code === "ERR_CANCELED")
  );
}

/** Mutations are intentionally excluded: retrying them can duplicate writes. */
export function shouldRetryReadRequest(error: AxiosError, attempt: number) {
  if (
    attempt >= MAX_READ_RETRIES ||
    isRequestCanceled(error) ||
    error.config?.signal?.aborted
  ) {
    return false;
  }

  const method = error.config?.method?.toUpperCase() ?? "GET";
  if (!SAFE_READ_METHODS.has(method)) return false;

  const status = error.response?.status;
  return status === undefined || TRANSIENT_STATUS_CODES.has(status);
}

/** Capped exponential backoff: 250 ms, then 500 ms. */
export function getReadRetryDelay(attempt: number) {
  return 250 * 2 ** attempt;
}

/** Resolves false immediately on navigation/unmount instead of waiting to retry. */
export function waitForReadRetry(delayMs: number, signal?: RetryAbortSignal) {
  return new Promise<boolean>((resolve) => {
    if (signal?.aborted) {
      resolve(false);
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(true);
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

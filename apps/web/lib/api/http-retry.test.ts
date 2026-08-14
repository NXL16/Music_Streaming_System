import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it, vi } from "vitest";
import {
  getReadRetryDelay,
  MAX_READ_RETRIES,
  shouldRetryReadRequest,
  waitForReadRetry,
} from "./http-retry";

function requestError(method: string, status?: number, code?: string) {
  const error = new AxiosError("request failed", code, {
    method,
    headers: new AxiosHeaders(),
  });
  if (status !== undefined) {
    error.response = {
      status,
      statusText: "error",
      headers: {},
      config: error.config!,
      data: {},
    };
  }
  return error;
}

describe("HTTP read retry policy", () => {
  it("retries transient GET failures with capped backoff", () => {
    expect(shouldRetryReadRequest(requestError("get", 503), 0)).toBe(true);
    expect(shouldRetryReadRequest(requestError("head", 429), 1)).toBe(true);
    expect(
      shouldRetryReadRequest(requestError("get", 500), MAX_READ_RETRIES),
    ).toBe(false);
    expect(getReadRetryDelay(0)).toBe(250);
    expect(getReadRetryDelay(1)).toBe(500);
  });

  it("retries a GET network failure but never a mutation or permanent client error", () => {
    expect(
      shouldRetryReadRequest(requestError("get", undefined, "ERR_NETWORK"), 0),
    ).toBe(true);
    expect(shouldRetryReadRequest(requestError("post", 503), 0)).toBe(false);
    expect(
      shouldRetryReadRequest(
        requestError("delete", undefined, "ERR_NETWORK"),
        0,
      ),
    ).toBe(false);
    expect(shouldRetryReadRequest(requestError("get", 404), 0)).toBe(false);
  });

  it("stops the retry wait immediately when the request is aborted", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const pending = waitForReadRetry(500, controller.signal);
    controller.abort();
    await expect(pending).resolves.toBe(false);
    vi.useRealTimers();
  });
});

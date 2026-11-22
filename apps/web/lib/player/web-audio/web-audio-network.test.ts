import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRange, RangeFetchResponseError } from "./fetcher";
import { fetchWebAudioRange } from "./web-audio-network";

vi.mock("./fetcher", async (original) => ({
  ...(await original<typeof import("./fetcher")>()),
  fetchRange: vi.fn(),
}));
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe("web-audio range retries", () => {
  it("honors backoff and preserves the exact requested byte range", async () => {
    vi.useFakeTimers();
    const data = new ArrayBuffer(8);
    vi.mocked(fetchRange)
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(data);
    const controller = new AbortController();
    const request = fetchWebAudioRange("audio", 16, 31, controller.signal);
    await vi.advanceTimersByTimeAsync(249);
    expect(fetchRange).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchRange).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(499);
    expect(fetchRange).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(await request).toBe(data);

    for (const call of vi.mocked(fetchRange).mock.calls)
      expect(call).toEqual(["audio", 16, 31, controller.signal]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels a pending retry immediately when the song is replaced", async () => {
    vi.useFakeTimers();
    vi.mocked(fetchRange).mockRejectedValue(new TypeError("offline"));
    const controller = new AbortController();
    const request = fetchWebAudioRange("audio", 0, 15, controller.signal);
    const result = expect(request).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await result;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchRange).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not retry permanent HTTP failures", async () => {
    const error = new RangeFetchResponseError(false, 403);
    vi.mocked(fetchRange).mockRejectedValue(error);
    await expect(
      fetchWebAudioRange("audio", 0, 15, new AbortController().signal),
    ).rejects.toBe(error);

    expect(fetchRange).toHaveBeenCalledTimes(1);
  });

  it("wakes a pending backoff when the connection returns and removes listeners", async () => {
    vi.useFakeTimers();
    const bus = new EventTarget();
    const remove = vi.fn(bus.removeEventListener.bind(bus));
    vi.stubGlobal("addEventListener", bus.addEventListener.bind(bus));
    vi.stubGlobal("removeEventListener", remove);
    const data = new ArrayBuffer(1);
    vi.mocked(fetchRange)
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(data);
    const request = fetchWebAudioRange(
      "audio",
      0,
      15,
      new AbortController().signal,
    );
    await vi.advanceTimersByTimeAsync(0);
    bus.dispatchEvent(new Event("online"));
    expect(await request).toBe(data);
    expect(fetchRange).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith("online", expect.any(Function));
  });
});

describe("range request lifecycle", () => {
  it("retries the real HTTP request only through the Web Audio backoff", async () => {
    vi.useFakeTimers();
    const actual =
      await vi.importActual<typeof import("./fetcher")>("./fetcher");
    vi.mocked(fetchRange).mockImplementation(actual.fetchRange);
    const http = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array(16), {
          status: 206,
          headers: { "Content-Range": "bytes 0-15/16" },
        }),
      );
    vi.stubGlobal("fetch", http);
    const request = fetchWebAudioRange(
      "audio",
      0,
      15,
      new AbortController().signal,
    );
    try {
      await vi.advanceTimersByTimeAsync(0);

      await vi.advanceTimersByTimeAsync(249);
      expect(http).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect((await request).byteLength).toBe(16);
      expect(http).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      await vi.runAllTimersAsync();
    }
  });

  it("aborts an invalid response before returning the HTTP failure", async () => {
    vi.useFakeTimers();
    const actual =
      await vi.importActual<typeof import("./fetcher")>("./fetcher");
    const http = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", http);
    await expect(actual.fetchRange("audio", 0, 15)).rejects.toBeInstanceOf(
      RangeFetchResponseError,
    );
    expect(http.mock.calls[0][1].signal.aborted).toBe(true);
    expect(http).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects an oversized body before reading another chunk", async () => {
    vi.useFakeTimers();
    const actual =
      await vi.importActual<typeof import("./fetcher")>("./fetcher");
    const reader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({ done: false, value: new Uint8Array(17) })
        .mockResolvedValue({ done: true }),
      releaseLock: vi.fn(),
    };
    const http = vi.fn().mockResolvedValue({
      status: 206,
      headers: new Headers({ "Content-Range": "bytes 0-15/100" }),
      body: { getReader: () => reader },
    });
    vi.stubGlobal("fetch", http);
    const request = actual.fetchRange("audio", 0, 15);
    const failure = expect(request).rejects.toBeInstanceOf(
      RangeFetchResponseError,
    );
    await vi.runAllTimersAsync();
    await failure;
    expect(reader.read).toHaveBeenCalledTimes(1);
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    expect(http.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

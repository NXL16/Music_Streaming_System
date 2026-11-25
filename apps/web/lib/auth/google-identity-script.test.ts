import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadGoogleIdentityScript } from "./google-identity-script";

let script: EventTarget & {
  dataset: Record<string, string>;
  remove: ReturnType<typeof vi.fn>;
};
let append: ReturnType<typeof vi.fn>;
let browser: {
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  google?: unknown;
};

beforeEach(() => {
  vi.useFakeTimers();
  script = Object.assign(new EventTarget(), { dataset: {}, remove: vi.fn() });
  append = vi.fn();
  browser = { setTimeout, clearTimeout };
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", {
    querySelector: () => null,
    createElement: () => script,
    head: { appendChild: append },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("shares one script request and cleans listeners/timer when it loads", async () => {
  const remove = vi.spyOn(script, "removeEventListener");
  const first = loadGoogleIdentityScript();
  const second = loadGoogleIdentityScript();
  expect(first).toBe(second);
  expect(append).toHaveBeenCalledOnce();
  browser.google = { accounts: { oauth2: {} } };
  script.dispatchEvent(new Event("load"));
  await first;
  expect(remove).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
  await loadGoogleIdentityScript();
  expect(append).toHaveBeenCalledOnce();
});

it("times out blocked scripts, cleans up and allows a retry", async () => {
  const request = loadGoogleIdentityScript();
  const failure = expect(request).rejects.toThrow(
    "Google sign-in is unavailable",
  );
  await vi.advanceTimersByTimeAsync(10_000);
  await failure;
  expect(vi.getTimerCount()).toBe(0);
  const retry = loadGoogleIdentityScript();
  script.dispatchEvent(new Event("error"));
  await expect(retry).rejects.toThrow();
  expect(append).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});

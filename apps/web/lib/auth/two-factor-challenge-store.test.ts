import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  saveTwoFactorChallengeId,
  getTwoFactorChallengeId,
  clearTwoFactorChallengeId,
  subscribeTwoFactorChallenge,
} from "./two-factor-challenge-store";

let storage: Map<string, string>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  storage = new Map();
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("expires the sign-in session after five minutes and notifies the form", () => {
  saveTwoFactorChallengeId("test-challenge");
  const listener = vi.fn();
  const unsubscribe = subscribeTwoFactorChallenge(listener);
  listener.mockClear();
  vi.advanceTimersByTime(299999);
  expect(getTwoFactorChallengeId()).toBe("test-challenge");
  expect(listener).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(getTwoFactorChallengeId()).toBeNull();
  expect(listener).toHaveBeenCalledOnce();
  unsubscribe();
});

it("removes the old session and its timer when verification finishes or is cancelled", () => {
  saveTwoFactorChallengeId("test-challenge");
  const unsubscribe = subscribeTwoFactorChallenge(vi.fn());
  clearTwoFactorChallengeId();
  expect(storage.size).toBe(0);
  expect(getTwoFactorChallengeId()).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
  unsubscribe();
});

it("cleans up timers and listeners when leaving the page", () => {
  saveTwoFactorChallengeId("test-challenge");
  const listener = vi.fn();
  const unsubscribe = subscribeTwoFactorChallenge(listener);
  unsubscribe();
  listener.mockClear();
  clearTwoFactorChallengeId();
  vi.advanceTimersByTime(300000);
  expect(listener).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("rejects old stored challenges without expiration information", () => {
  storage.set("2fa_challenge_id", "old-challenge");
  expect(getTwoFactorChallengeId()).toBeNull();
});

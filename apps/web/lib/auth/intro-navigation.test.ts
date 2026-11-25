import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { navigateFromIntro, type IntroDestination } from "./intro-navigation";

let destinationReady: boolean;
let destinationHidden: boolean;
let destinationInvisible: boolean;
let onMutation: () => void;
let update: () => Promise<void>;
let complete: () => void;
let attributes: Set<string>;
const disconnect = vi.fn();
const skipTransition = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  destinationReady = false;
  destinationHidden = false;
  destinationInvisible = false;
  attributes = new Set();
  const finished = new Promise<void>((resolve) => {
    complete = resolve;
  });
  skipTransition.mockImplementation(() => complete());
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: false }),
    getComputedStyle: () => ({
      visibility: destinationInvisible ? "hidden" : "visible",
    }),
    location: { pathname: "/", replace: vi.fn() },
    setTimeout,
    clearTimeout,
  });
  vi.stubGlobal("document", {
    documentElement: {
      setAttribute: (key: string) => attributes.add(key),
      removeAttribute: (key: string) => attributes.delete(key),
    },
    body: {},
    querySelectorAll: () =>
      destinationReady
        ? [{ getClientRects: () => (destinationHidden ? [] : [{}]) }]
        : [],
    startViewTransition: (callback: () => Promise<void>) => {
      update = callback;
      return { ready: Promise.resolve(), finished, skipTransition };
    },
  });
  vi.stubGlobal(
    "MutationObserver",
    class {
      constructor(callback: () => void) {
        onMutation = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function arrive(href: IntroDestination) {
  window.location.pathname = href;
  destinationReady = true;
  onMutation();
}

it("finishes Home navigation when its frame mounts without waiting for API data", () => {
  const navigate = vi.fn();
  navigateFromIntro("/home", navigate);
  expect(navigate).toHaveBeenCalledExactlyOnceWith("/home");
  arrive("/home");
  expect(disconnect).toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(4000);
  expect(window.location.replace).not.toHaveBeenCalled();
});

it.each(["/home", "/login"] as const)(
  "recovers a stuck navigation to %s before its URL changes",
  (href) => {
    Object.assign(document, { startViewTransition: undefined });
    navigateFromIntro(href, vi.fn());
    vi.advanceTimersByTime(4000);
    expect(window.location.replace).toHaveBeenCalledExactlyOnceWith(href);
    expect(vi.getTimerCount()).toBe(0);
  },
);

it.each(["/home", "/login"] as const)(
  "recovers a blank destination at %s even after its URL changes",
  (href) => {
    Object.assign(document, { startViewTransition: undefined });
    navigateFromIntro(href, vi.fn());
    window.location.pathname = href;
    onMutation();
    vi.advanceTimersByTime(4000);
    expect(window.location.replace).toHaveBeenCalledExactlyOnceWith(href);
    expect(vi.getTimerCount()).toBe(0);
  },
);

it("uses one continuous deadline across the URL change and frame mount", () => {
  navigateFromIntro("/home", vi.fn());
  vi.advanceTimersByTime(2500);
  window.location.pathname = "/home";
  onMutation();
  expect(vi.getTimerCount()).toBe(1);
  vi.advanceTimersByTime(1500);
  expect(window.location.replace).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("does not accept a hidden cached destination as ready", () => {
  navigateFromIntro("/home", vi.fn());
  destinationHidden = true;
  arrive("/home");
  vi.advanceTimersByTime(4000);
  expect(window.location.replace).toHaveBeenCalledOnce();
});

it("waits when a destination occupies space but is still hidden by navigation", () => {
  navigateFromIntro("/home", vi.fn());
  destinationInvisible = true;
  arrive("/home");
  expect(vi.getTimerCount()).toBe(1);
  destinationInvisible = false;
  onMutation();
  expect(vi.getTimerCount()).toBe(0);
});

it("does not override navigation to another page", () => {
  navigateFromIntro("/home", vi.fn());
  window.location.pathname = "/search";
  onMutation();
  expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(4000);
  expect(window.location.replace).not.toHaveBeenCalled();
});

it("cancels timers and observation when the persistent owner unmounts", () => {
  const cancel = navigateFromIntro("/home", vi.fn());
  cancel();
  cancel();
  expect(disconnect).toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(4000);
  expect(window.location.replace).not.toHaveBeenCalled();
});

it("waits for the visible Login form before running the handoff animation", async () => {
  const navigate = vi.fn();
  navigateFromIntro("/login", navigate);
  const pending = update();
  expect(navigate).toHaveBeenCalledExactlyOnceWith("/login");
  expect(attributes.has("data-brand-handoff")).toBe(true);
  destinationHidden = true;
  arrive("/login");
  let resolved = false;
  void pending.then(() => {
    resolved = true;
  });
  await Promise.resolve();
  expect(resolved).toBe(false);
  destinationHidden = false;
  onMutation();
  await pending;
  complete();
  await Promise.resolve();
  expect(attributes.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it("releases a stalled Login animation while keeping the route recovery deadline", async () => {
  navigateFromIntro("/login", vi.fn());
  const pending = update();
  await vi.advanceTimersByTimeAsync(3000);
  await pending;
  expect(skipTransition).toHaveBeenCalled();
  expect(attributes.size).toBe(0);
  expect(vi.getTimerCount()).toBe(1);
  await vi.advanceTimersByTimeAsync(1000);
  expect(window.location.replace).toHaveBeenCalledExactlyOnceWith("/login");
  expect(vi.getTimerCount()).toBe(0);
});

it("cleans up even if the native animation never finishes by itself", async () => {
  navigateFromIntro("/login", vi.fn());
  const pending = update();
  arrive("/login");
  await pending;
  await vi.advanceTimersByTimeAsync(5000);
  expect(skipTransition).toHaveBeenCalled();
  expect(attributes.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it("does not execute an obsolete Login callback after a new Home navigation starts", async () => {
  const oldNavigate = vi.fn();
  const cancel = navigateFromIntro("/login", oldNavigate);
  cancel();
  const currentNavigate = vi.fn();
  navigateFromIntro("/home", currentNavigate);
  await update();
  expect(oldNavigate).not.toHaveBeenCalled();
  expect(currentNavigate).toHaveBeenCalledExactlyOnceWith("/home");
  arrive("/home");
  expect(attributes.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it("uses normal routing if the native transition cannot start", () => {
  Object.assign(document, {
    startViewTransition: () => {
      throw new Error("Unavailable");
    },
  });
  const navigate = vi.fn();
  navigateFromIntro("/login", navigate);
  expect(navigate).toHaveBeenCalledExactlyOnceWith("/login");
  arrive("/login");
  expect(attributes.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["unsupported", "reduced-motion"])("routes normally for %s", (mode) => {
  if (mode === "unsupported")
    Object.assign(document, { startViewTransition: undefined });
  else Object.assign(window, { matchMedia: () => ({ matches: true }) });
  const navigate = vi.fn();
  navigateFromIntro("/login", navigate);
  expect(navigate).toHaveBeenCalledExactlyOnceWith("/login");
  arrive("/login");
  expect(attributes.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it("recovers immediately if the client router throws", () => {
  navigateFromIntro("/home", () => {
    throw new Error("Router failed");
  });
  expect(window.location.replace).toHaveBeenCalledExactlyOnceWith("/home");
  expect(vi.getTimerCount()).toBe(0);
});

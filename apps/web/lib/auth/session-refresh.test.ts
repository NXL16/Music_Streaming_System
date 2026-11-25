import { afterEach, beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  post: vi.fn(),
  locks: vi.fn(),
  clearCache: vi.fn(),
}));
vi.mock("./session-cache", () => ({ clearClientSessionCache: api.clearCache }));
vi.mock("axios", () => ({
  default: {
    create: () => ({ post: api.post }),
    isAxiosError: (error: { isAxiosError?: boolean } | null) =>
      error?.isAxiosError === true,
  },
}));

let broadcast: (data: unknown) => void;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  vi.stubGlobal("navigator", { locks: { request: api.locks } });
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      listeners = new Set<(event: { data: unknown }) => void>();
      constructor() {
        broadcast = (data) => {
          for (const listener of this.listeners) listener({ data });
        };
      }
      addEventListener(
        _type: string,
        listener: (event: { data: unknown }) => void,
      ) {
        this.listeners.add(listener);
      }
      removeEventListener(
        _type: string,
        listener: (event: { data: unknown }) => void,
      ) {
        this.listeners.delete(listener);
      }
      postMessage() {}
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const session = {
  accessToken: "test-token",
  expiresIn: 3600,
  user: { userId: "listener" },
};

it.each([
  null,
  { ...session, expiresIn: undefined },
  { ...session, expiresIn: Number.NaN },
  { ...session, expiresIn: Number.POSITIVE_INFINITY },
  { ...session, expiresIn: 0 },
  { ...session, accessToken: "" },
  { ...session, user: {} },
])(
  "does not authenticate an incomplete or invalid refresh response: %j",
  async (invalid) => {
    vi.stubGlobal("navigator", {});
    api.post.mockResolvedValue({ data: { data: invalid } });
    const { refreshAccessToken } = await import("./session-refresh");
    const { useAuthStore } = await import("./auth-store");
    await expect(refreshAccessToken()).rejects.toThrow();
    expect(useAuthStore.getState().status).toBe("checking");
    expect(api.clearCache).not.toHaveBeenCalled();
  },
);

it("ignores malformed shared sessions and still accepts a subsequent valid session", async () => {
  api.locks.mockImplementation(async (_name, _options, callback) =>
    callback(null),
  );
  const { refreshAccessToken } = await import("./session-refresh");
  const { useAuthStore } = await import("./auth-store");
  const pending = refreshAccessToken();
  await vi.advanceTimersByTimeAsync(0);
  broadcast({ type: "session", senderId: "another-tab", session: {} });
  await vi.advanceTimersByTimeAsync(0);
  expect(useAuthStore.getState().status).toBe("checking");
  broadcast({ type: "session", senderId: "another-tab", session });
  await expect(pending).resolves.toBe(session);
  expect(useAuthStore.getState().status).toBe("authenticated");
  expect(vi.getTimerCount()).toBe(0);
});

it("coalesces concurrent refreshes and clears the speculative shared-session timer", async () => {
  api.locks.mockImplementation(async (_name, _options, callback) =>
    callback({}),
  );
  api.post.mockResolvedValue({ data: { data: session } });
  const { refreshAccessToken } = await import("./session-refresh");
  const first = refreshAccessToken();
  expect(refreshAccessToken()).toBe(first);
  await expect(first).resolves.toBe(session);
  expect(api.post).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("clears user caches on an account change but keeps them during a same-user refresh", async () => {
  vi.stubGlobal("navigator", {});
  api.post.mockResolvedValue({ data: { data: session } });
  const { refreshAccessToken } = await import("./session-refresh");
  const { useAuthStore } = await import("./auth-store");
  await refreshAccessToken();
  api.clearCache.mockClear();
  await refreshAccessToken();
  expect(api.clearCache).not.toHaveBeenCalled();
  api.post.mockResolvedValue({
    data: { data: { ...session, user: { userId: "another-user" } } },
  });
  await refreshAccessToken();
  expect(api.clearCache).toHaveBeenCalledOnce();
  expect(useAuthStore.getState().user?.userId).toBe("another-user");
});

it("rejects after the shared-session timeout instead of queuing behind a suspended tab", async () => {
  api.locks.mockImplementation(async (_name, _options, callback) =>
    callback(null),
  );
  const { refreshAccessToken } = await import("./session-refresh");
  const pending = refreshAccessToken();
  const rejected = expect(pending).rejects.toThrow(
    "Session refresh is still in progress",
  );
  await vi.advanceTimersByTimeAsync(20_000);
  await rejected;
  expect(api.locks).toHaveBeenCalledTimes(2);
  for (const [, options] of api.locks.mock.calls)
    expect(options).toEqual({ ifAvailable: true });
  expect(api.post).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("retries safely when the previous owner released its lock without broadcasting", async () => {
  api.locks
    .mockImplementationOnce(async (_name, _options, callback) => callback(null))
    .mockImplementationOnce(async (_name, _options, callback) => callback({}));
  api.post.mockResolvedValue({ data: { data: session } });
  const { refreshAccessToken } = await import("./session-refresh");
  const pending = refreshAccessToken();
  await vi.advanceTimersByTimeAsync(20_000);
  await expect(pending).resolves.toBe(session);
  expect(api.post).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("accepts the other tab's session without sending a second refresh request", async () => {
  api.locks.mockImplementation(async (_name, _options, callback) =>
    callback(null),
  );
  const { refreshAccessToken } = await import("./session-refresh");
  const pending = refreshAccessToken();
  await vi.advanceTimersByTimeAsync(0);
  broadcast({ type: "session", senderId: "another-tab", session });
  await expect(pending).resolves.toBe(session);
  expect(api.post).not.toHaveBeenCalled();
  expect(api.locks).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("does not retry refresh after another tab confirms the session is rejected", async () => {
  api.locks.mockImplementation(async (_name, _options, callback) =>
    callback(null),
  );
  const { refreshAccessToken } = await import("./session-refresh");
  const pending = refreshAccessToken();
  const rejected = expect(pending).rejects.toThrow("Shared refresh rejected");
  await vi.advanceTimersByTimeAsync(0);
  broadcast({ type: "guest", senderId: "another-tab" });
  await rejected;
  expect(api.post).not.toHaveBeenCalled();
  expect(api.locks).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("handles a shared rejection during a leader request without an unhandled promise", async () => {
  api.locks.mockImplementation(async (_name, _options, callback) =>
    callback({}),
  );
  let finish!: (response: unknown) => void;
  api.post.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const { refreshAccessToken } = await import("./session-refresh");
  const pending = refreshAccessToken();
  const rejected = expect(pending).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(0);
  broadcast({ type: "guest", senderId: "another-tab" });
  await vi.advanceTimersByTimeAsync(0);
  finish({ data: { data: session } });
  await rejected;
  expect(vi.getTimerCount()).toBe(0);
});

it("refreshes normally when cross-tab locks are unavailable", async () => {
  vi.stubGlobal("navigator", {});
  api.post.mockResolvedValue({ data: { data: session } });
  const { refreshAccessToken } = await import("./session-refresh");
  await expect(refreshAccessToken()).resolves.toBe(session);
  expect(api.post).toHaveBeenCalledOnce();
  expect(api.locks).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it.each([400, 401, 403])(
  "clears the session only when refresh is rejected with %s",
  async (status) => {
    vi.stubGlobal("navigator", {});
    const error = { isAxiosError: true, response: { status } };
    api.post.mockRejectedValue(error);
    const { refreshAccessToken } = await import("./session-refresh");
    const { useAuthStore } = await import("./auth-store");
    await expect(refreshAccessToken()).rejects.toBe(error);
    expect(useAuthStore.getState().status).toBe("guest");
  },
);

it.each([undefined, 429, 500, 502, 503, 504])(
  "does not classify a temporary refresh failure (%s) as signed out",
  async (status) => {
    vi.stubGlobal("navigator", {});
    const error = {
      isAxiosError: true,
      response: status ? { status } : undefined,
    };
    api.post.mockRejectedValue(error);
    const { refreshAccessToken } = await import("./session-refresh");
    const { useAuthStore } = await import("./auth-store");
    await expect(refreshAccessToken()).rejects.toBe(error);
    expect(useAuthStore.getState().status).toBe("checking");
    api.post.mockResolvedValue({ data: { data: session } });
    await expect(refreshAccessToken()).resolves.toBe(session);
    expect(useAuthStore.getState().status).toBe("authenticated");
  },
);

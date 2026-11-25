"use client";

import axios from "axios";
import type { ApiResponse, AuthSession } from "./auth.types";
import { useAuthStore } from "./auth-store";
import { clearClientSessionCache } from "./session-cache";

const refreshHttp = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 15000,
  withCredentials: true,
});

let refreshPromise: Promise<AuthSession> | null = null;
const REFRESH_LOCK_NAME = "music-auth-refresh";
const LOCK_ACQUIRE_TIMEOUT_MS = 1000;
const SESSION_CHANNEL_NAME = "music-auth-session";
const SHARED_REFRESH_TIMEOUT_MS = 20_000;
const tabId =
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

type SessionMessage =
  | { type: "session"; senderId: string; session: AuthSession }
  | { type: "guest"; senderId: string };
type OutboundSessionMessage =
  { type: "session"; session: AuthSession } | { type: "guest" };

let sessionChannel: BroadcastChannel | null | undefined;

function isValidSession(session: unknown): session is AuthSession {
  if (!session || typeof session !== "object") return false;
  const value = session as Partial<AuthSession>;
  return (
    typeof value.accessToken === "string" &&
    value.accessToken.length > 0 &&
    typeof value.user?.userId === "string" &&
    value.user.userId.length > 0 &&
    typeof value.expiresIn === "number" &&
    Number.isFinite(value.expiresIn) &&
    value.expiresIn > 0
  );
}

function applySession(session: AuthSession) {
  if (!isValidSession(session)) {
    throw new Error("Refresh response không hợp lệ");
  }

  if (useAuthStore.getState().user?.userId !== session.user.userId) {
    clearClientSessionCache();
  }

  useAuthStore
    .getState()
    .setSession(session.accessToken, session.user, session.expiresIn);
}

function getSessionChannel() {
  if (sessionChannel !== undefined) return sessionChannel;
  if (
    typeof window === "undefined" ||
    typeof BroadcastChannel === "undefined"
  ) {
    sessionChannel = null;
    return sessionChannel;
  }

  sessionChannel = new BroadcastChannel(SESSION_CHANNEL_NAME);
  sessionChannel.addEventListener(
    "message",
    (event: MessageEvent<SessionMessage>) => {
      const message = event.data;
      if (!message || message.senderId === tabId) return;

      if (message.type === "session") {
        if (isValidSession(message.session)) applySession(message.session);
        return;
      }

      if (message.type === "guest") {
        useAuthStore.getState().setGuest();
      }
    },
  );
  return sessionChannel;
}

function broadcast(message: OutboundSessionMessage) {
  getSessionChannel()?.postMessage({ ...message, senderId: tabId });
}

function waitForSharedSession() {
  const channel = getSessionChannel();
  if (!channel) return null;

  let timer: number | undefined;
  let listener: ((event: MessageEvent<SessionMessage>) => void) | undefined;
  const cancel = () => {
    if (timer !== undefined) window.clearTimeout(timer);
    if (listener) channel.removeEventListener("message", listener);
  };

  const promise = new Promise<AuthSession | "guest" | "timeout">((resolve) => {
    timer = window.setTimeout(() => {
      cancel();
      resolve("timeout");
    }, SHARED_REFRESH_TIMEOUT_MS);

    listener = (event: MessageEvent<SessionMessage>) => {
      const message = event.data;
      if (!message || message.senderId === tabId) return;
      if (message.type !== "session" && message.type !== "guest") return;
      if (message.type === "session" && !isValidSession(message.session))
        return;
      cancel();

      if (message.type === "session") {
        resolve(message.session);
      } else {
        resolve("guest");
      }
    };

    channel.addEventListener("message", listener);
  });

  return { promise, cancel };
}

function isRejectedRefresh(error: unknown) {
  if (!axios.isAxiosError(error)) return false;

  const status = error.response?.status;
  return status === 400 || status === 401 || status === 403;
}

async function requestRefresh(
  sessionVersion: number,
  shouldBroadcast: boolean,
) {
  return refreshHttp
    .post<ApiResponse<AuthSession>>("/auth/refresh")
    .then((response) => {
      const session = response.data.data;

      if (useAuthStore.getState().sessionVersion !== sessionVersion) {
        throw new Error("Refresh response đã hết hiệu lực");
      }

      applySession(session);
      if (shouldBroadcast) broadcast({ type: "session", session });

      return session;
    })
    .catch((error: unknown) => {
      if (
        isRejectedRefresh(error) &&
        useAuthStore.getState().sessionVersion === sessionVersion
      ) {
        useAuthStore.getState().setGuest();
        if (shouldBroadcast) broadcast({ type: "guest" });
      }

      throw error;
    });
}

async function refreshAcrossTabs(sessionVersion: number): Promise<AuthSession> {
  if (
    typeof window === "undefined" ||
    !navigator.locks ||
    !getSessionChannel()
  ) {
    return requestRefresh(sessionVersion, false);
  }

  const sharedSession = waitForSharedSession();
  try {
    let lockTimer: number | undefined;
    let lockTimedOut = false;
    const leaderResult = await Promise.race([
      navigator.locks.request(
        REFRESH_LOCK_NAME,
        { ifAvailable: true },
        async (lock) => {
          if (lockTimer !== undefined) window.clearTimeout(lockTimer);
          if (!lock || lockTimedOut) return null;
          return requestRefresh(sessionVersion, true);
        },
      ),
      new Promise<AuthSession | "lock-timeout">((resolve) => {
        lockTimer = window.setTimeout(() => {
          lockTimedOut = true;
          resolve("lock-timeout");
        }, LOCK_ACQUIRE_TIMEOUT_MS);
      }),
    ]).finally(() => {
      if (lockTimer !== undefined) window.clearTimeout(lockTimer);
    });

    if (leaderResult === "lock-timeout") {
      return requestRefresh(sessionVersion, false);
    }
    if (leaderResult) return leaderResult;

    const sharedResult = await sharedSession!.promise;
    if (sharedResult === "guest") throw new Error("Shared refresh rejected");
    if (sharedResult !== "timeout") return sharedResult;

    // Never queue behind a suspended tab or race its refresh token.
    return navigator.locks.request(
      REFRESH_LOCK_NAME,
      { ifAvailable: true },
      (lock) => {
        if (!lock) throw new Error("Session refresh is still in progress");
        return requestRefresh(useAuthStore.getState().sessionVersion, true);
      },
    );
  } finally {
    sharedSession?.cancel();
  }
}

export function refreshAccessToken(): Promise<AuthSession> {
  if (refreshPromise) return refreshPromise;

  const sessionVersion = useAuthStore.getState().sessionVersion;

  refreshPromise = refreshAcrossTabs(sessionVersion).finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

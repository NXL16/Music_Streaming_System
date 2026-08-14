"use client";

import axios from "axios";
import type { ApiResponse, AuthSession } from "./auth.types";
import { useAuthStore } from "./auth-store";

const refreshHttp = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 15000,
  withCredentials: true,
});

let refreshPromise: Promise<AuthSession> | null = null;
const REFRESH_LOCK_NAME = "music-auth-refresh";
const SESSION_CHANNEL_NAME = "music-auth-session";
const SHARED_REFRESH_TIMEOUT_MS = 20_000;
const tabId =
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

type SessionMessage =
  | { type: "session"; senderId: string; session: AuthSession }
  | { type: "guest"; senderId: string };
type OutboundSessionMessage =
  | { type: "session"; session: AuthSession }
  | { type: "guest" };

let sessionChannel: BroadcastChannel | null | undefined;

function applySession(session: AuthSession) {
  if (!session.accessToken || !session.user || session.expiresIn <= 0) {
    throw new Error("Refresh response không hợp lệ");
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
        applySession(message.session);
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

  const promise = new Promise<AuthSession>((resolve, reject) => {
    timer = window.setTimeout(() => {
      cancel();
      reject(new Error("Timed out waiting for shared refresh session"));
    }, SHARED_REFRESH_TIMEOUT_MS);

    listener = (event: MessageEvent<SessionMessage>) => {
      const message = event.data;
      if (!message || message.senderId === tabId) return;
      cancel();

      if (message.type === "session") {
        resolve(message.session);
      } else {
        reject(new Error("Shared refresh rejected"));
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
    const leaderResult = await navigator.locks.request(
      REFRESH_LOCK_NAME,
      { ifAvailable: true },
      async (lock) => {
        if (!lock) return null;
        return requestRefresh(sessionVersion, true);
      },
    );

    if (leaderResult) return leaderResult;

    try {
      return await sharedSession!.promise;
    } catch {
      // If the owner tab was closed before it could broadcast, wait for its
      // lock to be released before retrying. This avoids racing the same
      // refresh token.
      return navigator.locks.request(REFRESH_LOCK_NAME, () =>
        requestRefresh(useAuthStore.getState().sessionVersion, true),
      );
    }
  } finally {
    // A leader refresh can reject before broadcasting. Without this cleanup,
    // the speculative follower waiter rejects 20 seconds later as an unhandled
    // Promise rejection in the same tab.
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

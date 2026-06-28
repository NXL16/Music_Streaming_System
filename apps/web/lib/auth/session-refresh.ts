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

function isRejectedRefresh(error: unknown) {
  if (!axios.isAxiosError(error)) return false;

  const status = error.response?.status;
  return status === 400 || status === 401 || status === 403;
}

export function refreshAccessToken(): Promise<AuthSession> {
  if (refreshPromise) return refreshPromise;

  const sessionVersion = useAuthStore.getState().sessionVersion;

  refreshPromise = refreshHttp
    .post<ApiResponse<AuthSession>>("/auth/refresh")
    .then((response) => {
      const session = response.data.data;

      if (!session.accessToken || !session.user || session.expiresIn <= 0) {
        throw new Error("Refresh response không hợp lệ");
      }

      if (useAuthStore.getState().sessionVersion !== sessionVersion) {
        throw new Error("Refresh response đã hết hiệu lực");
      }

      useAuthStore
        .getState()
        .setSession(session.accessToken, session.user, session.expiresIn);

      return session;
    })
    .catch((error: unknown) => {
      if (
        isRejectedRefresh(error) &&
        useAuthStore.getState().sessionVersion === sessionVersion
      ) {
        useAuthStore.getState().setGuest();
      }

      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

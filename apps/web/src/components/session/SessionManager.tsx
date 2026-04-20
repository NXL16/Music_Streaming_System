"use client";

import { useEffect, useRef } from "react";
import { api } from "@/src/lib/api";
import { useAuthStore } from "@/src/store/useAuthStore";
import { AuthRefreshApiResponse } from "@musical/shared-types";

const REFRESH_EARLY_MS = 90 * 1000;

const parseJwtExpMs = (token: string): number | null => {
  try {
    const parts = token.split(".");
    if (parts.length < 2 || !parts[1]) {
      return null;
    }

    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const decoded = atob(padded);
    const payload = JSON.parse(decoded) as { exp?: number };

    if (!payload.exp || Number.isNaN(payload.exp)) {
      return null;
    }

    return payload.exp * 1000;
  } catch {
    return null;
  }
};

export default function SessionManager() {
  const token = useAuthStore((state) => state.token);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const deviceId = useAuthStore((state) => state.deviceId);
  const setSession = useAuthStore((state) => state.setSession);
  const logout = useAuthStore((state) => state.logout);

  const refreshingRef = useRef(false);

  useEffect(() => {
    if (!token || !refreshToken) {
      return;
    }

    const expMs = parseJwtExpMs(token);
    if (!expMs) {
      return;
    }

    const delayMs = Math.max(expMs - Date.now() - REFRESH_EARLY_MS, 0);

    const timeoutId = window.setTimeout(async () => {
      if (refreshingRef.current) {
        return;
      }

      refreshingRef.current = true;

      try {
        const response = await api.post<AuthRefreshApiResponse>("/auth/refresh", {
          refreshToken,
        });

        const data = response.data?.data;
        const nextAccessToken = data?.accessToken;
        const nextRefreshToken = data?.refreshToken;
        const nextDeviceId = data?.deviceId ?? deviceId;

        if (!nextAccessToken || !nextRefreshToken || !nextDeviceId) {
          logout();
          return;
        }

        setSession({
          accessToken: nextAccessToken,
          refreshToken: nextRefreshToken,
          deviceId: nextDeviceId,
        });
      } catch {
        logout();
      } finally {
        refreshingRef.current = false;
      }
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [token, refreshToken, deviceId, setSession, logout]);

  return null;
}

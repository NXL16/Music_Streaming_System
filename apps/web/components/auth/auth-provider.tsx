"use client";

import { useEffect, useRef } from "react";
import { useAuthStore } from "@/lib/auth/auth-store";
import { refreshAccessToken } from "@/lib/auth/session-refresh";

const REFRESH_EARLY_MS = 60_000;
const REFRESH_RETRY_MS = 15_000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initializedRef = useRef(false);
  const status = useAuthStore((state) => state.status);
  const accessTokenExpiresAt = useAuthStore(
    (state) => state.accessTokenExpiresAt,
  );
  const setGuest = useAuthStore((state) => state.setGuest);

  useEffect(() => {
    if (initializedRef.current) return;

    initializedRef.current = true;

    async function bootstrapSession() {
      try {
        await refreshAccessToken();
      } catch {
        if (useAuthStore.getState().status === "checking") {
          setGuest();
        }
      }
    }

    void bootstrapSession();
  }, [setGuest]);

  useEffect(() => {
    if (status !== "authenticated" || !accessTokenExpiresAt) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let refreshInProgress = false;

    const runRefresh = async () => {
      if (refreshInProgress) return;
      refreshInProgress = true;

      try {
        await refreshAccessToken();
      } catch {
        if (!disposed && useAuthStore.getState().status === "authenticated") {
          timer = setTimeout(runRefresh, REFRESH_RETRY_MS);
        }
      } finally {
        refreshInProgress = false;
      }
    };

    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);

      const delay = Math.max(
        accessTokenExpiresAt - Date.now() - REFRESH_EARLY_MS,
        0,
      );
      timer = setTimeout(runRefresh, delay);
    };

    const handleVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() >= accessTokenExpiresAt - REFRESH_EARLY_MS
      ) {
        if (timer) clearTimeout(timer);
        void runRefresh();
      }
    };

    scheduleRefresh();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [accessTokenExpiresAt, status]);

  return children;
}

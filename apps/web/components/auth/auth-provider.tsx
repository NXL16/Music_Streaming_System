"use client";

import { useEffect, useRef } from "react";
import { refreshSession } from "@/lib/auth/auth.api";
import { useAuthStore } from "@/lib/auth/auth-store";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initializedRef = useRef(false);
  const setSession = useAuthStore((state) => state.setSession);
  const setGuest = useAuthStore((state) => state.setGuest);

  useEffect(() => {
    if (initializedRef.current) return;

    initializedRef.current = true;

    async function bootstrapSession() {
      try {
        const result = await refreshSession();

        if (!result.data.accessToken || !result.data.user) {
          setGuest();
          return;
        }

        setSession(result.data.accessToken, result.data.user);
      } catch {
        setGuest();
      }
    }

    void bootstrapSession();
  }, [setGuest, setSession]);

  return children;
}

"use client";

import { useEffect, useState } from "react";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { getProfile } from "@/lib/auth/auth.api";
import { useAuthStore } from "@/lib/auth/auth-store";

export function useProfile() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    let cancelled = false;

    async function loadProfile() {
      setError("");
      setLoading(true);

      try {
        const result = await getProfile();

        if (!cancelled) {
          setUser(result.data);
        }
      } catch (error) {
        if (!cancelled) {
          setError(
            getApiErrorMessage(
              error,
              "Không thể tải thông tin hồ sơ mới nhất.",
            ),
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [setUser, status]);

  return {
    user,
    loading,
    error,
  };
}

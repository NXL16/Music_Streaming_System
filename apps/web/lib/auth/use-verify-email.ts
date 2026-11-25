"use client";

import { useEffect, useState } from "react";
import { getApiErrorStatus, getApiErrorMessage } from "@/lib/api/api-error";
import { createQueryCache } from "@/lib/api/query-cache";
import { useMinimumLoadingDuration } from "@/lib/loading/use-minimum-loading-duration";
import { verifyEmail } from "./auth.api";
import { useAuthStore } from "./auth-store";

const verifiedEmails = createQueryCache<string>({ maxEntries: 8 });

export function useVerifyEmail(token: string) {
  const authStatus = useAuthStore((state) => state.status);
  const [status, setStatus] = useState<
    "loading" | "success" | "invalid" | "error"
  >(token ? "loading" : "invalid");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const checking = useMinimumLoadingDuration(
    status === "loading" || authStatus === "checking",
  );

  useEffect(() => {
    if (!token || authStatus === "checking") return;
    let cancelled = false;
    void verifiedEmails
      .get(token, async () => (await verifyEmail({ token })).data.userId, {
        ttlMs: 5 * 60 * 1000,
      })
      .then(
        (userId) => {
          if (cancelled) return;
          const session = useAuthStore.getState();
          if (
            session.status === "authenticated" &&
            session.user?.userId === userId
          )
            session.setUser({ ...session.user, emailVerified: true });
          setStatus("success");
        },
        (error: unknown) => {
          if (cancelled) return;
          const code = getApiErrorStatus(error);
          if (code === 400 || code === 401 || code === 403) {
            setStatus("invalid");
            return;
          }
          setMessage(
            code === 429
              ? getApiErrorMessage(
                  error,
                  "Too many attempts. Please try again later.",
                )
              : "We couldn't verify your email right now. Please try again.",
          );
          setStatus("error");
        },
      );
    return () => {
      cancelled = true;
    };
  }, [token, attempt, authStatus]);

  return {
    status,
    message,
    checking,
    authenticated: authStatus === "authenticated",
    retry: () => {
      if (status !== "error") return;
      setStatus("loading");
      setMessage("");
      setAttempt((current) => current + 1);
    },
  };
}

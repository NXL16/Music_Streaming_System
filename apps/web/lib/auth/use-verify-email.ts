"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { verifyEmail } from "@/lib/auth/auth.api";
import { useAuthStore } from "@/lib/auth/auth-store";

type VerifyEmailStatus = "idle" | "loading" | "success" | "error";

const MIN_LOADING_MS = 2000;
const SUCCESS_REDIRECT_MS = 1200;
const VERIFIED_EMAIL_TOKEN_TTL_MS = 5 * 60 * 1000;
const MAX_VERIFIED_EMAIL_TOKENS = 8;
const verifyEmailRequests = new Map<string, ReturnType<typeof verifyEmail>>();
const verifiedEmailTokens = new Map<string, number>();

function getVerifyEmailRequest(token: string) {
  const existingRequest = verifyEmailRequests.get(token);

  if (existingRequest) {
    return existingRequest;
  }

  const request = verifyEmail({ token });
  verifyEmailRequests.set(token, request);
  void request.then(
    () => {
      if (verifyEmailRequests.get(token) === request) {
        verifyEmailRequests.delete(token);
      }
    },
    () => {
      if (verifyEmailRequests.get(token) === request) {
        verifyEmailRequests.delete(token);
      }
    },
  );

  return request;
}

function hasVerifiedEmailToken(token: string) {
  const now = Date.now();
  for (const [cachedToken, expiresAt] of verifiedEmailTokens) {
    if (expiresAt <= now) verifiedEmailTokens.delete(cachedToken);
  }

  const expiresAt = verifiedEmailTokens.get(token);
  if (!expiresAt) return false;
  return expiresAt > now;
}

function rememberVerifiedEmailToken(token: string) {
  verifiedEmailTokens.delete(token);
  verifiedEmailTokens.set(token, Date.now() + VERIFIED_EMAIL_TOKEN_TTL_MS);

  while (verifiedEmailTokens.size > MAX_VERIFIED_EMAIL_TOKENS) {
    const oldestToken = verifiedEmailTokens.keys().next().value as
      | string
      | undefined;
    if (oldestToken === undefined) break;
    verifiedEmailTokens.delete(oldestToken);
  }
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function useVerifyEmail() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setUser = useAuthStore((state) => state.setUser);
  const authStatus = useAuthStore((state) => state.status);

  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);

  const [status, setStatus] = useState<VerifyEmailStatus>("idle");
  const [message, setMessage] = useState("");
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!token) {
      queueMicrotask(() => {
        setStatus("error");
        setMessage("Token xác thực email không hợp lệ.");
        setRedirecting(false);
      });
      return;
    }

    if (hasVerifiedEmailToken(token)) {
      queueMicrotask(() => {
        setStatus("success");
        setMessage("Email đã được xác thực.");
        setRedirecting(false);
      });
      return;
    }

    let cancelled = false;
    let redirectTimer: number | undefined;

    async function verify() {
      setStatus("loading");
      setMessage("");
      setRedirecting(false);

      try {
        const startedAt = Date.now();
        const result = await getVerifyEmailRequest(token);
        const remainingDelayMs = Math.max(
          MIN_LOADING_MS - (Date.now() - startedAt),
          0,
        );

        if (remainingDelayMs > 0) {
          await wait(remainingDelayMs);
        }

        if (cancelled) {
          return;
        }

        rememberVerifiedEmailToken(token);

        if (authStatus === "authenticated") {
          setUser(result.data);
        }

        setStatus("success");
        setMessage(result.message || "Email đã được xác thực.");
        setRedirecting(true);

        redirectTimer = window.setTimeout(() => {
          router.push("/profile");
        }, SUCCESS_REDIRECT_MS);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setStatus("error");
        setMessage(getApiErrorMessage(error, "Không thể xác thực email."));
        setRedirecting(false);
      }
    }

    void verify();

    return () => {
      cancelled = true;

      if (redirectTimer) {
        window.clearTimeout(redirectTimer);
      }
    };
  }, [authStatus, router, setUser, token]);

  return {
    status,
    message,
    redirecting,
  };
}

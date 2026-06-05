"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { verifyEmail } from "@/lib/auth/auth.api";
import { useAuthStore } from "@/lib/auth/auth-store";

type VerifyEmailStatus = "idle" | "loading" | "success" | "error";

const MIN_LOADING_MS = 2000;
const SUCCESS_REDIRECT_MS = 1200;
const verifyEmailRequests = new Map<string, ReturnType<typeof verifyEmail>>();
const verifiedEmailTokens = new Set<string>();

function getVerifyEmailRequest(token: string) {
  const existingRequest = verifyEmailRequests.get(token);

  if (existingRequest) {
    return existingRequest;
  }

  const request = verifyEmail({ token });
  verifyEmailRequests.set(token, request);

  return request;
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
      setStatus("error");
      setMessage("Token xác thực email không hợp lệ.");
      setRedirecting(false);
      return;
    }

    if (verifiedEmailTokens.has(token)) {
      setStatus("success");
      setMessage("Email đã được xác thực.");
      setRedirecting(false);
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

        verifiedEmailTokens.add(token);

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
        verifyEmailRequests.delete(token);
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

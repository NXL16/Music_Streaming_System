"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { verifyTwoFactorLogin } from "@/lib/auth/auth.api";
import { useAuthStore } from "@/lib/auth/auth-store";
import {
  clearTwoFactorChallengeId,
  getTwoFactorChallengeId,
} from "@/lib/auth/two-factor-challenge-store";

export function useTwoFactorLoginForm() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);

  const [credential, setCredential] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const challengeId = getTwoFactorChallengeId();

    if (!challengeId) {
      router.replace("/login");
    }
  }, [router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const challengeId = getTwoFactorChallengeId();

      if (!challengeId) {
        router.replace("/login");
        return;
      }

      const result = await verifyTwoFactorLogin({
        challengeId,
        credential,
      });

      clearTwoFactorChallengeId();
      setSession(result.data.accessToken, result.data.user);
      router.push("/");
    } catch (error) {
      setError(getApiErrorMessage(error, "Ma 2FA khong hop le."));
    } finally {
      setLoading(false);
    }
  }

  return {
    credential,
    error,
    loading,
    setCredential,
    handleSubmit,
  };
}

"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getApiErrorStatus } from "@/lib/api/api-error";
import { useMinimumLoadingDuration } from "@/lib/loading/use-minimum-loading-duration";
import { verifyTwoFactorLogin } from "./auth.api";
import { useAuthStore } from "./auth-store";
import { resolveTwoFactorVerificationInput } from "./two-factor-verification";
import {
  clearTwoFactorChallengeId,
  getTwoFactorChallengeId,
  subscribeTwoFactorChallenge,
} from "./two-factor-challenge-store";
import { validateVerificationForm } from "./auth-form-validation";
import { useAuthForm } from "./use-auth-form";

export function useTwoFactorLoginForm() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  const challengeId = useSyncExternalStore(
    subscribeTwoFactorChallenge,
    getTwoFactorChallengeId,
    () => undefined,
  );
  const checking = useMinimumLoadingDuration(challengeId === undefined);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const auth = useAuthForm(
    { verificationInput: "" },
    (values) => validateVerificationForm(values, recoveryMode),
    async (form) => {
      const currentChallengeId = getTwoFactorChallengeId();
      if (!currentChallengeId) return;
      try {
        const result = await verifyTwoFactorLogin({
          challengeId: currentChallengeId,
          ...resolveTwoFactorVerificationInput(form.verificationInput),
        });
        clearTwoFactorChallengeId();
        setSession(
          result.data.accessToken,
          result.data.user,
          result.data.expiresIn,
        );
        router.replace("/home");
      } catch (error) {
        if (getApiErrorStatus(error) === 409) clearTwoFactorChallengeId();
        throw error;
      }
    },
    "two-factor",
  );

  return {
    ...auth,
    checking,
    expired: challengeId === null,
    recoveryMode,
    toggleRecoveryMode: () => {
      if (auth.loading) return;
      auth.reset();
      setRecoveryMode((current) => !current);
    },
    handleSubmit: (event: FormEvent<HTMLFormElement>) => {
      if (auth.loading || !getTwoFactorChallengeId()) {
        event.preventDefault();
        return;
      }
      return auth.handleSubmit(event);
    },
  };
}

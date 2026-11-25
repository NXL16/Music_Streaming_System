"use client";
import { useRouter } from "next/navigation";
import { login } from "./auth.api";
import { useAuthStore } from "./auth-store";
import { getOrCreateDeviceId } from "./device-id";
import { saveTwoFactorChallengeId } from "./two-factor-challenge-store";
import {
  validateLoginForm,
  type LoginFormValues,
} from "./auth-form-validation";
import { useAuthForm } from "./use-auth-form";

export function useLoginForm() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  return useAuthForm<LoginFormValues>(
    { identifier: "", password: "" },
    validateLoginForm,
    async (form) => {
      const result = await login({
        ...form,
        identifier: form.identifier.trim(),
        deviceId: getOrCreateDeviceId(),
      });
      if (result.data.twoFactorRequired) {
        if (!result.data.twoFactorChallengeId)
          throw new Error("Missing authentication challenge");
        saveTwoFactorChallengeId(result.data.twoFactorChallengeId);
        router.push("/login/2fa");
        return;
      }
      setSession(
        result.data.accessToken,
        result.data.user,
        result.data.expiresIn,
      );
      router.replace("/home");
    },
    "login",
  );
}

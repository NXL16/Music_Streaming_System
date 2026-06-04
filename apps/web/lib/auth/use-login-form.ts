"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { login } from "@/lib/auth/auth.api";
import { useAuthStore } from "@/lib/auth/auth-store";
import { getOrCreateDeviceId } from "@/lib/auth/device-id";
import { saveTwoFactorChallengeId } from "@/lib/auth/two-factor-challenge-store";

type LoginForm = {
  username: string;
  password: string;
};

const initialLoginForm: LoginForm = {
  username: "",
  password: "",
};

export function useLoginForm() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);

  const [form, setForm] = useState<LoginForm>(initialLoginForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function updateField<TField extends keyof LoginForm>(
    field: TField,
    value: LoginForm[TField],
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await login({
        ...form,
        deviceId: getOrCreateDeviceId(),
      });

      if (result.data.twoFactorRequired) {
        if (result.data.twoFactorChallengeId) {
          saveTwoFactorChallengeId(result.data.twoFactorChallengeId);
        }

        router.push("/login/2fa");
        return;
      }

      setSession(result.data.accessToken, result.data.user);
      router.push("/");
    } catch (error) {
      setError(
        getApiErrorMessage(error, "Đăng nhập thất bại, vui lòng thử lại"),
      );
    } finally {
      setLoading(false);
    }
  }

  return {
    form,
    error,
    loading,
    updateField,
    handleSubmit,
  };
}

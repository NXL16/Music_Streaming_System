"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { signup } from "@/lib/auth/auth.api";
import { useAuthStore } from "@/lib/auth/auth-store";
import { getOrCreateDeviceId } from "@/lib/auth/device-id";

type SignupForm = {
  displayName: string;
  username: string;
  email: string;
  password: string;
};

const initialSignupForm: SignupForm = {
  displayName: "",
  username: "",
  email: "",
  password: "",
};

export function useSignupForm() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);

  const [form, setForm] = useState<SignupForm>(initialSignupForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function updateField<TField extends keyof SignupForm>(
    field: TField,
    value: SignupForm[TField],
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
      const result = await signup({
        ...form,
        deviceId: getOrCreateDeviceId(),
      });

      setSession(
        result.data.accessToken,
        result.data.user,
        result.data.expiresIn,
      );
      router.push("/");
    } catch (error) {
      setError(
        getApiErrorMessage(error, "Đăng ký thất bại, vui lòng thử lại"),
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

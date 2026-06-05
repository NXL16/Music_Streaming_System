"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { changePassword, logout } from "@/lib/auth/auth.api";
import { useAuthStore } from "@/lib/auth/auth-store";

type ChangePasswordForm = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const initialForm: ChangePasswordForm = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

export function useChangePasswordForm() {
  const router = useRouter();
  const clearSession = useAuthStore((state) => state.clearSession);

  const [form, setForm] = useState<ChangePasswordForm>(initialForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function updateField<TField extends keyof ChangePasswordForm>(
    field: TField,
    value: ChangePasswordForm[TField],
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (form.newPassword !== form.confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }

    setLoading(true);

    try {
      await changePassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });

      await logout().catch(() => undefined);
      clearSession();
      router.push("/login");
    } catch (error) {
      setError(
        getApiErrorMessage(
          error,
          "Không thể đổi mật khẩu, vui lòng thử lại.",
        ),
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

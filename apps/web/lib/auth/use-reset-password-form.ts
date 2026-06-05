"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { resetPassword } from "@/lib/auth/auth.api";

type ResetPasswordForm = {
  newPassword: string;
  confirmPassword: string;
};

const initialForm: ResetPasswordForm = {
  newPassword: "",
  confirmPassword: "",
};

export function useResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);

  const [form, setForm] = useState<ResetPasswordForm>(initialForm);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function updateField<TField extends keyof ResetPasswordForm>(
    field: TField,
    value: ResetPasswordForm[TField],
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!token) {
      setError("Token đặt lại mật khẩu không hợp lệ.");
      return;
    }

    if (form.newPassword !== form.confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }

    setLoading(true);

    try {
      const result = await resetPassword({
        token,
        newPassword: form.newPassword,
      });

      setSuccessMessage(result.message || "Đặt lại mật khẩu thành công.");

      window.setTimeout(() => {
        router.push("/login");
      }, 1200);
    } catch (error) {
      setError(
        getApiErrorMessage(
          error,
          "Không thể đặt lại mật khẩu, vui lòng thử lại.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  return {
    form,
    token,
    error,
    successMessage,
    loading,
    updateField,
    handleSubmit,
  };
}

"use client";

import { useState } from "react";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { forgotPassword } from "@/lib/auth/auth.api";

type ForgotPasswordForm = {
  email: string;
};

const initialForm: ForgotPasswordForm = {
  email: "",
};

export function useForgotPasswordForm() {
  const [form, setForm] = useState<ForgotPasswordForm>(initialForm);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function updateField<TField extends keyof ForgotPasswordForm>(
    field: TField,
    value: ForgotPasswordForm[TField],
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
    setLoading(true);

    try {
      const result = await forgotPassword({
        email: form.email.trim(),
      });

      setSuccessMessage(
        result.message ||
          "Nếu email tồn tại, hệ thống sẽ gửi link đặt lại mật khẩu.",
      );
    } catch (error) {
      setError(
        getApiErrorMessage(
          error,
          "Không thể gửi yêu cầu đặt lại mật khẩu, vui lòng thử lại.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  return {
    form,
    error,
    successMessage,
    loading,
    updateField,
    handleSubmit,
  };
}

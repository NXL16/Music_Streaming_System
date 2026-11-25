"use client";

import { useState, type FormEvent } from "react";
import { forgotPassword } from "./auth.api";
import { validateEmailForm } from "./auth-form-validation";
import { useAuthForm } from "./use-auth-form";

export function useForgotPasswordForm() {
  const [sentEmail, setSentEmail] = useState("");
  const auth = useAuthForm(
    { email: "" },
    validateEmailForm,
    async ({ email }) => {
      const normalizedEmail = email.trim().toLowerCase();
      await forgotPassword({ email: normalizedEmail });
      setSentEmail(normalizedEmail);
    },
    "forgot-password",
  );

  return {
    ...auth,
    sentEmail,
    changeEmail: () => {
      if (auth.loading) return;
      setSentEmail("");
      auth.clearError();
    },
    handleSubmit: (event: FormEvent<HTMLFormElement>) => {
      if (auth.loading) {
        event.preventDefault();
        return;
      }
      return auth.handleSubmit(event);
    },
  };
}

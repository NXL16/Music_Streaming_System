"use client";

import { useRef, useState } from "react";
import {
  securityFormError,
  validateResetPasswordForm,
} from "./auth-form-validation";
import { useRouter } from "next/navigation";
import { getApiErrorStatus } from "@/lib/api/api-error";
import {
  changePassword,
  logout,
  verifyCurrentPassword,
} from "@/lib/auth/auth.api";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useMinimumLoadingState } from "@/lib/loading/use-minimum-loading-duration";

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
  const inFlight = useRef(false);
  const router = useRouter();
  const clearSession = useAuthStore((state) => state.clearSession);

  const [form, setForm] = useState<ChangePasswordForm>(initialForm);
  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useMinimumLoadingState();

  function updateField<TField extends keyof ChangePasswordForm>(
    field: TField,
    value: ChangePasswordForm[TField],
  ) {
    setError("");
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (inFlight.current) return;
    if (!form.currentPassword) {
      setError("Enter your current password.");
      return;
    }
    if (step === 1) {
      inFlight.current = true;
      setLoading(true);
      try {
        await verifyCurrentPassword(form.currentPassword);
        setStep(2);
      } catch (error) {
        setError(
          securityFormError(
            error,
            getApiErrorStatus(error) === 400
              ? "Your current password is incorrect."
              : "Could not check your password. Please try again.",
          ),
        );
      } finally {
        inFlight.current = false;
        setLoading(false);
      }
      return;
    }
    const errors = validateResetPasswordForm(form);
    const validationError = errors.newPassword || errors.confirmPassword;
    if (validationError) {
      setError(validationError);
      return;
    }
    inFlight.current = true;
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
        securityFormError(
          error,
          "Could not change your password. Please try again.",
        ),
      );
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }

  return {
    reset: () => {
      setForm(initialForm);
      setError("");
      setStep(1);
    },
    back: () => {
      if (inFlight.current) return;
      setStep(1);
      setError("");
    },
    step,
    form,
    error,
    loading,
    updateField,
    handleSubmit,
  };
}

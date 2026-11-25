"use client";

import { useEffect, useState, type FormEvent } from "react";
import { getApiErrorStatus } from "@/lib/api/api-error";
import { resetPassword, validatePasswordResetToken } from "./auth.api";
import {
  authFormError,
  validateResetPasswordForm,
} from "./auth-form-validation";
import { useAuthForm } from "./use-auth-form";
import { useMinimumLoadingDuration } from "@/lib/loading/use-minimum-loading-duration";

export function useResetPasswordForm(token: string) {
  const [status, setStatus] = useState<
    "checking" | "editing" | "success" | "invalid" | "check-error"
  >(token ? "checking" : "invalid");
  const [checkVersion, setCheckVersion] = useState(0);
  const [checkError, setCheckError] = useState("");
  const checking = useMinimumLoadingDuration(status === "checking");

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    void validatePasswordResetToken(token, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted)
          setStatus(result.data.valid ? "editing" : "invalid");
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const code = getApiErrorStatus(error);
        if (code === 400 || code === 401) {
          setStatus("invalid");
          return;
        }
        setCheckError(
          code === 429
            ? authFormError(error, "reset-password")
            : "We couldn't check this link. Please try again.",
        );
        setStatus("check-error");
      },
    );
    return () => controller.abort();
  }, [token, checkVersion]);
  const auth = useAuthForm(
    { newPassword: "", confirmPassword: "" },
    validateResetPasswordForm,
    async ({ newPassword }) => {
      try {
        await resetPassword({ token, newPassword });
        setStatus("success");
      } catch (error) {
        if (getApiErrorStatus(error) === 401) setStatus("invalid");
        throw error;
      }
    },
    "reset-password",
  );

  return {
    ...auth,
    status,
    checking,
    checkError,
    retryValidation: () => {
      if (status !== "check-error") return;
      setCheckError("");
      setStatus("checking");
      setCheckVersion((version) => version + 1);
    },
    handleSubmit: (event: FormEvent<HTMLFormElement>) => {
      if (auth.loading || status !== "editing") {
        event.preventDefault();
        return;
      }
      return auth.handleSubmit(event);
    },
  };
}

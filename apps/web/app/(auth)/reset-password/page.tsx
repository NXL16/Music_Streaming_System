"use client";

import { Suspense, useContext } from "react";
import { useSearchParams } from "next/navigation";
import Loading from "@/app/loading";
import {
  AuthForm,
  AuthInput,
  AuthFormSubmit,
} from "@/components/auth/auth-form";
import { AuthNavigationContext } from "@/components/auth/auth-navigation";
import { GuestOnly } from "@/components/auth/guest-only";
import { PasswordRequirementsInput } from "@/components/auth/password-requirements-input";
import { useResetPasswordForm } from "@/lib/auth/use-reset-password-form";

function ResetPasswordForm({ token }: { token: string }) {
  const {
    form,
    fieldErrors,
    error,
    loading,
    status,
    checking,
    checkError,
    retryValidation,
    updateField,
    validateField,
    handleSubmit,
  } = useResetPasswordForm(token);
  const navigate = useContext(AuthNavigationContext);
  const editing = status === "editing";
  const success = status === "success";
  const checkFailed = status === "check-error";

  if (checking)
    return (
      <GuestOnly>
        <Loading />
      </GuestOnly>
    );

  return (
    <GuestOnly>
      <AuthForm
        title={
          success
            ? "Password updated"
            : editing
              ? "Reset password"
              : checkFailed
                ? "Couldn't check link"
                : "Reset link unavailable"
        }
        description={
          success
            ? "You can now sign in with your new password."
            : editing
              ? "Choose a new password for your account."
              : checkFailed
                ? checkError
                : "This link is missing, expired or has already been used. Request a new one to continue."
        }
        recovery
        hideFooter={success}
        navigationDisabled={loading}
        aria-busy={loading}
        onSubmit={(event) => {
          if (editing) return handleSubmit(event);
          event.preventDefault();
          if (checkFailed) {
            retryValidation();
            return;
          }
          if (!loading) navigate?.(success ? "/login" : "/forgot-password");
        }}
      >
        {editing && (
          <>
            <PasswordRequirementsInput
              id="reset-new-password"
              name="newPassword"
              label="New password"
              autoComplete="new-password"
              disabled={loading}
              value={form.newPassword}
              error={fieldErrors.newPassword}
              onChange={(event) =>
                updateField("newPassword", event.target.value)
              }
              onBlur={() => validateField("newPassword")}
            />
            <AuthInput
              id="reset-confirm-password"
              name="confirmPassword"
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              disabled={loading}
              value={form.confirmPassword}
              error={fieldErrors.confirmPassword}
              onChange={(event) =>
                updateField("confirmPassword", event.target.value)
              }
              onBlur={() => validateField("confirmPassword")}
            />
          </>
        )}
        <AuthFormSubmit
          disabled={loading}
          message={editing ? error : null}
          reserveFeedbackSpace={editing}
        >
          {loading
            ? "Resetting..."
            : success
              ? "Sign in"
              : editing
                ? "Reset password"
                : checkFailed
                  ? "Try again"
                  : "Request a new link"}
        </AuthFormSubmit>
      </AuthForm>
    </GuestOnly>
  );
}

function ResetPasswordContent() {
  const token = useSearchParams().get("token")?.trim() ?? "";
  return <ResetPasswordForm key={token} token={token} />;
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ResetPasswordContent />
    </Suspense>
  );
}

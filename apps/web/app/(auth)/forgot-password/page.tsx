"use client";

import { useEffect, useRef } from "react";
import {
  AuthForm,
  AuthInput,
  AuthFormSubmit,
} from "@/components/auth/auth-form";
import { GuestOnly } from "@/components/auth/guest-only";
import { useForgotPasswordForm } from "@/lib/auth/use-forgot-password-form";
import styles from "@/components/auth/auth-form.module.css";

export default function ForgotPasswordPage() {
  const {
    form,
    fieldErrors,
    error,
    sentEmail,
    changeEmail,
    loading,
    updateField,
    validateField,
    handleSubmit,
  } = useForgotPasswordForm();
  const formRef = useRef<HTMLFormElement>(null);
  const previousEmail = useRef(sentEmail);

  useEffect(() => {
    if (previousEmail.current === sentEmail) return;
    previousEmail.current = sentEmail;
    formRef.current
      ?.querySelector<HTMLElement>(
        sentEmail ? "[data-recovery-email]" : "input",
      )
      ?.focus();
  }, [sentEmail]);

  return (
    <GuestOnly>
      <AuthForm
        title={sentEmail ? "Check your inbox" : "Forgot password?"}
        description={
          sentEmail
            ? "If an account exists, a reset link is on its way."
            : "Enter your email and we'll send you a reset link."
        }
        recovery
        ref={formRef}
        onSubmit={handleSubmit}
        aria-busy={loading}
        navigationDisabled={loading}
      >
        {sentEmail ? (
          <div className={styles.recoveryEmail}>
            <span data-recovery-email tabIndex={-1} role="status">
              {sentEmail}
            </span>
            <button
              type="button"
              className={styles.recoveryEdit}
              disabled={loading}
              onClick={changeEmail}
              aria-label="Change email"
            >
              Change
            </button>
          </div>
        ) : (
          <AuthInput
            id="forgot-password-email"
            name="email"
            type="email"
            label="Email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={loading}
            value={form.email}
            error={fieldErrors.email}
            onChange={(event) => updateField("email", event.target.value)}
            onBlur={() => validateField("email")}
          />
        )}
        <AuthFormSubmit
          disabled={loading}
          message={error}
          reserveFeedbackSpace={!sentEmail}
        >
          {loading
            ? "Sending..."
            : sentEmail
              ? "Send again"
              : "Send reset link"}
        </AuthFormSubmit>
      </AuthForm>
    </GuestOnly>
  );
}

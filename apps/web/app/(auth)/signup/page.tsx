"use client";

import { useEffect, useRef } from "react";
import {
  AuthForm,
  AuthInput,
  AuthFormSubmit,
} from "@/components/auth/auth-form";
import { GuestOnly } from "@/components/auth/guest-only";
import { useSignupForm } from "@/lib/auth/use-signup-form";
import styles from "@/components/auth/auth-form.module.css";
import { PasswordRequirementsInput } from "@/components/auth/password-requirements-input";

export default function SignupPage() {
  const {
    form,
    fieldErrors,
    error,
    loading,
    step,
    goBack,
    updateField,
    validateField,
    handleSubmit,
  } = useSignupForm();
  const formRef = useRef<HTMLFormElement>(null);
  const previousStep = useRef(step);

  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    formRef.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [step]);

  return (
    <GuestOnly>
      <AuthForm
        title="Create account"
        signup
        ref={formRef}
        onSubmit={handleSubmit}
        aria-busy={loading}
        navigationDisabled={loading}
      >
        <div className={styles.stepHeader}>
          <span aria-live="polite">Step {step} of 2</span>
          {step === 2 && (
            <button type="button" disabled={loading} onClick={goBack}>
              Back
            </button>
          )}
        </div>
        {step === 2 ? (
          <>
            <AuthInput
              id="signup-name"
              name="displayName"
              label="Display name"
              autoComplete="nickname"
              disabled={loading}
              value={form.displayName}
              error={fieldErrors.displayName}
              onChange={(event) =>
                updateField("displayName", event.target.value)
              }
              onBlur={() => validateField("displayName")}
            />
            <AuthInput
              id="signup-username"
              name="username"
              label="Username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={loading}
              value={form.username}
              error={fieldErrors.username}
              onChange={(event) => updateField("username", event.target.value)}
              onBlur={() => validateField("username")}
            />
          </>
        ) : (
          <>
            <AuthInput
              id="signup-email"
              name="email"
              label="Email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={loading}
              value={form.email}
              error={fieldErrors.email}
              onChange={(event) => updateField("email", event.target.value)}
              onBlur={() => validateField("email")}
            />
            <PasswordRequirementsInput
              reserveFeedbackSpace
              id="signup-password"
              name="password"
              label="Password"
              autoComplete="new-password"
              disabled={loading}
              value={form.password}
              error={fieldErrors.password}
              onChange={(event) => updateField("password", event.target.value)}
              onBlur={() => validateField("password")}
            />
          </>
        )}
        <AuthFormSubmit
          disabled={loading}
          message={step === 2 ? error : null}
          reserveFeedbackSpace={step === 2}
          className={step === 1 ? "mt-4" : undefined}
        >
          {loading
            ? "Creating account..."
            : step === 1
              ? "Continue"
              : "Create account"}
        </AuthFormSubmit>
      </AuthForm>
    </GuestOnly>
  );
}

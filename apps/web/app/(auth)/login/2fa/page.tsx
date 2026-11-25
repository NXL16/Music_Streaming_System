"use client";

import { useContext } from "react";
import Loading from "@/app/loading";
import {
  AuthForm,
  AuthInput,
  AuthFormSubmit,
} from "@/components/auth/auth-form";
import {
  AuthNavigationContext,
  AuthNavigationLink,
} from "@/components/auth/auth-navigation";
import { GuestOnly } from "@/components/auth/guest-only";
import { clearTwoFactorChallengeId } from "@/lib/auth/two-factor-challenge-store";
import { useTwoFactorLoginForm } from "@/lib/auth/use-two-factor-login-form";
import styles from "@/components/auth/auth-form.module.css";

export default function TwoFactorLoginPage() {
  const {
    form,
    fieldErrors,
    error,
    loading,
    checking,
    expired,
    recoveryMode,
    toggleRecoveryMode,
    updateField,
    validateField,
    handleSubmit,
  } = useTwoFactorLoginForm();
  const navigate = useContext(AuthNavigationContext);
  function backToLogin() {
    clearTwoFactorChallengeId();
    navigate?.("/login", true);
  }

  if (checking)
    return (
      <GuestOnly>
        <Loading />
      </GuestOnly>
    );

  return (
    <GuestOnly>
      <AuthForm
        title={expired ? "Sign-in session expired" : "Verify it's you"}
        description={
          expired
            ? "Sign in again to start a new verification session."
            : recoveryMode
              ? "Enter a recovery code you saved when enabling two-factor authentication."
              : "Enter the 6-digit code from your authenticator app."
        }
        hideFooter={expired}
        navigationDisabled={loading}
        aria-busy={loading}
        onSubmit={(event) => {
          if (!expired) return handleSubmit(event);
          event.preventDefault();
          backToLogin();
        }}
        footer={
          <AuthNavigationLink
            href="/login"
            replace
            disabled={loading}
            beforeNavigate={clearTwoFactorChallengeId}
          >
            Back to sign in
          </AuthNavigationLink>
        }
      >
        {!expired && (
          <>
            <AuthInput
              id="login-verification"
              name="verificationInput"
              label={recoveryMode ? "Recovery code" : "Verification code"}
              placeholder={recoveryMode ? "Recovery code" : "000000"}
              autoComplete={recoveryMode ? "off" : "one-time-code"}
              inputMode={recoveryMode ? "text" : "numeric"}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={recoveryMode ? 24 : 6}
              disabled={loading}
              value={form.verificationInput}
              error={fieldErrors.verificationInput}
              onChange={(event) =>
                updateField("verificationInput", event.target.value)
              }
              onBlur={() => validateField("verificationInput")}
              style={{
                textAlign: "center",
                letterSpacing: recoveryMode ? "0.03em" : "0.16em",
              }}
            />
            <button
              type="button"
              className={styles.recoveryEdit + " self-center"}
              disabled={loading}
              onClick={toggleRecoveryMode}
            >
              {recoveryMode
                ? "Use an authenticator code"
                : "Use a recovery code"}
            </button>
          </>
        )}
        <AuthFormSubmit
          disabled={loading}
          message={expired ? null : error}
          reserveFeedbackSpace={!expired}
        >
          {loading ? "Verifying..." : expired ? "Back to sign in" : "Verify"}
        </AuthFormSubmit>
      </AuthForm>
    </GuestOnly>
  );
}

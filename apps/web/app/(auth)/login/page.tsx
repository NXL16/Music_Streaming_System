"use client";

import {
  AuthForm,
  AuthInput,
  AuthFormSubmit,
  GoogleLoginButton,
} from "@/components/auth/auth-form";
import { GuestOnly } from "@/components/auth/guest-only";
import { useGoogleLogin } from "@/lib/auth/use-google-login";
import { useLoginForm } from "@/lib/auth/use-login-form";
import { AuthNavigationLink } from "@/components/auth/auth-navigation";

export default function LoginPage() {
  const {
    form,
    fieldErrors,
    error,
    loading,
    clearError,
    updateField,
    validateField,
    handleSubmit,
  } = useLoginForm();
  const { googleError, googleLoading, clearGoogleError, startGoogleLogin } =
    useGoogleLogin();
  const busy = loading || googleLoading;

  return (
    <GuestOnly>
      <AuthForm
        title="Welcome!"
        onSubmit={(event) => {
          clearGoogleError();
          void handleSubmit(event);
        }}
        aria-busy={busy}
        navigationDisabled={busy}
      >
        <AuthInput
          id="login-identifier"
          name="identifier"
          label="Username or email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={busy}
          value={form.identifier}
          error={fieldErrors.identifier}
          onChange={(event) => updateField("identifier", event.target.value)}
          onBlur={() => validateField("identifier")}
        />
        <AuthInput
          id="login-password"
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          disabled={busy}
          value={form.password}
          error={fieldErrors.password}
          onChange={(event) => updateField("password", event.target.value)}
          onBlur={() => validateField("password")}
        />
        <AuthNavigationLink href="/forgot-password" disabled={busy}>
          Forgot password?
        </AuthNavigationLink>
        <GoogleLoginButton
          loading={googleLoading}
          disabled={busy}
          onClick={() => {
            clearError();
            void startGoogleLogin();
          }}
        />
        <AuthFormSubmit disabled={busy} message={error || googleError}>
          {loading ? "Logging in..." : "Login"}
        </AuthFormSubmit>
      </AuthForm>
    </GuestOnly>
  );
}

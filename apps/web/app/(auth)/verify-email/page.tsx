"use client";

import { Suspense, useContext } from "react";
import { useSearchParams } from "next/navigation";
import Loading from "@/app/loading";
import { AuthForm, AuthFormSubmit } from "@/components/auth/auth-form";
import { AuthNavigationContext } from "@/components/auth/auth-navigation";
import { useVerifyEmail } from "@/lib/auth/use-verify-email";

function VerifyEmailResult({ token }: { token: string }) {
  const { status, message, checking, authenticated, retry } =
    useVerifyEmail(token);
  const navigate = useContext(AuthNavigationContext);
  if (checking) return <Loading />;
  const success = status === "success";
  const failed = status === "error";

  return (
    <AuthForm
      title={
        success
          ? "Email verified"
          : failed
            ? "Couldn't verify email"
            : "Verification link unavailable"
      }
      description={
        success
          ? "Your email address has been verified."
          : failed
            ? message
            : "This link is missing, expired or has already been used. Request a new link from your account."
      }
      hideFooter
      onSubmit={(event) => {
        event.preventDefault();
        if (failed) retry();
        else navigate?.(authenticated ? "/account" : "/login", true);
      }}
    >
      <AuthFormSubmit
        disabled={false}
        message={null}
        reserveFeedbackSpace={false}
      >
        {failed ? "Try again" : authenticated ? "Back to account" : "Sign in"}
      </AuthFormSubmit>
    </AuthForm>
  );
}

function VerifyEmailContent() {
  const token = useSearchParams().get("token") ?? "";
  return <VerifyEmailResult key={token} token={token} />;
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<Loading />}>
      <VerifyEmailContent />
    </Suspense>
  );
}

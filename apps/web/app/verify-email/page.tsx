"use client";

import { Suspense } from "react";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { useVerifyEmail } from "@/lib/auth/use-verify-email";

function VerifyEmailContent() {
  const { status, message, redirecting } = useVerifyEmail();

  const title =
    status === "success"
      ? "Email verified"
      : status === "error"
        ? "Could not verify email"
        : "Verifying email";

  return (
    <AuthPageShell
      eyebrow="Email Verification"
      title={title}
      description={
        message || "Please wait while we check your email verification token."
      }
      narrow
    >
      {redirecting ? (
        <p className="mt-5 rounded-2xl bg-[#f5f5f7] px-4 py-3 text-sm font-semibold text-[#6e6e73]">
          Redirecting you back to profile...
        </p>
      ) : null}
    </AuthPageShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}

"use client";

import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { GuestOnly } from "@/components/auth/guest-only";
import { useTwoFactorLoginForm } from "@/lib/auth/use-two-factor-login-form";

export default function TwoFactorLoginPage() {
  const {
    error,
    loading,
    verificationInput,
    handleSubmit,
    setVerificationInput,
  } = useTwoFactorLoginForm();

  return (
    <GuestOnly>
      <AuthPageShell
        eyebrow="Two-Factor Auth"
        title="Enter verification code"
        description="Use your authenticator code or a saved recovery code."
        narrow
      >
        <form onSubmit={handleSubmit} className="mt-6">
          <label className="block text-sm font-semibold text-[#1d1d1f]">
            2FA code or recovery code
          </label>
          <input
            autoComplete="one-time-code"
            className="mt-2 w-full rounded-2xl bg-[#f5f5f7] px-4 py-3 text-center text-xl font-black tracking-[0.18em] outline-none ring-1 ring-[#d2d2d7] focus:ring-[#fa233b]"
            value={verificationInput}
            onChange={(event) => setVerificationInput(event.target.value)}
            placeholder="123456"
            required
          />

          {error ? (
            <div className="mt-5 rounded-2xl bg-[#fff1f3] px-4 py-3 text-sm font-medium text-[#d91d32]">
              {error}
            </div>
          ) : null}

          <button
            disabled={loading}
            className="mt-6 w-full rounded-full bg-[#fa233b] px-5 py-3 font-bold text-white transition hover:bg-[#d91d32] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Verifying..." : "Verify"}
          </button>
        </form>
      </AuthPageShell>
    </GuestOnly>
  );
}

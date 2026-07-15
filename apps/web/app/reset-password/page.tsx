"use client";

import { Suspense } from "react";
import Link from "next/link";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { GuestOnly } from "@/components/auth/guest-only";
import { useResetPasswordForm } from "@/lib/auth/use-reset-password-form";

function ResetPasswordContent() {
  const {
    form,
    token,
    error,
    successMessage,
    loading,
    updateField,
    handleSubmit,
  } = useResetPasswordForm();

  return (
    <GuestOnly>
      <AuthPageShell
        eyebrow="New Password"
        title="Create a fresh key for your account."
        description="Choose a strong password with uppercase, lowercase, number, and special character."
      >
        <form onSubmit={handleSubmit}>
          <h2 className="text-2xl font-bold tracking-[-0.04em]">
            Reset password
          </h2>

          {!token && (
            <div className="mt-5 rounded-2xl bg-[#fff1f3] px-4 py-3 text-sm font-medium text-[#d91d32]">
              Reset token is missing or invalid.
            </div>
          )}

          <label className="mt-6 block text-sm font-semibold text-[#1d1d1f]">
            New password
          </label>
          <input
            type="password"
            className="mt-2 w-full rounded-2xl bg-[#f5f5f7] px-4 py-3 outline-none ring-1 ring-[#d2d2d7] focus:ring-[#fa233b]"
            value={form.newPassword}
            onChange={(event) => updateField("newPassword", event.target.value)}
            required
            minLength={8}
          />

          <label className="mt-4 block text-sm font-semibold text-[#1d1d1f]">
            Confirm password
          </label>
          <input
            type="password"
            className="mt-2 w-full rounded-2xl bg-[#f5f5f7] px-4 py-3 outline-none ring-1 ring-[#d2d2d7] focus:ring-[#fa233b]"
            value={form.confirmPassword}
            onChange={(event) =>
              updateField("confirmPassword", event.target.value)
            }
            required
            minLength={8}
          />

          {error && (
            <div className="mt-5 rounded-2xl bg-[#fff1f3] px-4 py-3 text-sm font-medium text-[#d91d32]">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="mt-5 rounded-2xl bg-[#ecfdf3] px-4 py-3 text-sm font-medium text-[#067647]">
              {successMessage}
            </div>
          )}

          <button
            disabled={loading || !token}
            className="mt-6 w-full rounded-full bg-[#fa233b] px-5 py-3 font-bold text-white transition hover:bg-[#d91d32] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Resetting..." : "Reset password"}
          </button>

          <Link
            href="/login"
            className="mt-5 block text-center text-sm font-semibold text-[#fa233b] hover:underline"
          >
            Back to login
          </Link>
        </form>
      </AuthPageShell>
    </GuestOnly>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  );
}

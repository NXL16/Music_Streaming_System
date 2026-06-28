"use client";

import Link from "next/link";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { GuestOnly } from "@/components/auth/guest-only";
import { useForgotPasswordForm } from "@/lib/auth/use-forgot-password-form";

export default function ForgotPasswordPage() {
  const { form, error, successMessage, loading, updateField, handleSubmit } =
    useForgotPasswordForm();

  return (
    <GuestOnly>
      <AuthPageShell
        eyebrow="Password Recovery"
        title="Reset access to your music workspace."
        description="Enter your account email. If it exists, we will send a secure password reset link."
      >
        <form onSubmit={handleSubmit}>
          <h2 className="text-2xl font-bold tracking-[-0.04em]">Forgot password</h2>

          <label className="mt-6 block text-sm font-semibold text-[#1d1d1f]">Email</label>
          <input
            type="email"
            className="mt-2 w-full rounded-2xl bg-[#f5f5f7] px-4 py-3 outline-none ring-1 ring-[#d2d2d7] focus:ring-[#fa233b]"
            value={form.email}
            onChange={(event) => updateField("email", event.target.value)}
            required
          />

          {error ? (
            <div className="mt-5 rounded-2xl bg-[#fff1f3] px-4 py-3 text-sm font-medium text-[#d91d32]">
              {error}
            </div>
          ) : null}

          {successMessage ? (
            <div className="mt-5 rounded-2xl bg-[#ecfdf3] px-4 py-3 text-sm font-medium text-[#067647]">
              {successMessage}
            </div>
          ) : null}

          <button
            disabled={loading}
            className="mt-6 w-full rounded-full bg-[#fa233b] px-5 py-3 font-bold text-white transition hover:bg-[#d91d32] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Sending..." : "Send reset link"}
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

"use client";

import Link from "next/link";
import { GuestOnly } from "@/components/auth/guest-only";
import { useResetPasswordForm } from "@/lib/auth/use-reset-password-form";

export default function ResetPasswordPage() {
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
      <main className="min-h-screen bg-[#f7efe5] px-6 py-10 text-[#23170f]">
        <section className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_420px]">
          <div className="flex flex-col justify-center">
            <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#b65f38]">
              New Password
            </p>

            <h1 className="mt-5 max-w-xl text-5xl font-black leading-tight">
              Create a fresh key for your account.
            </h1>

            <p className="mt-5 max-w-lg text-lg text-[#705846]">
              Choose a strong password with uppercase, lowercase, number and
              special character.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-4xl border border-[#ead4bd] bg-white p-7 shadow-[0_24px_80px_rgba(95,55,25,0.16)]"
          >
            <h2 className="text-2xl font-bold">Reset password</h2>

            {!token ? (
              <div className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                Token đặt lại mật khẩu không hợp lệ hoặc đã bị thiếu.
              </div>
            ) : null}

            <label className="mt-6 block text-sm font-semibold">
              New password
            </label>
            <input
              type="password"
              className="mt-2 w-full rounded-2xl border border-[#ead4bd] px-4 py-3 outline-none focus:border-[#c45f36]"
              value={form.newPassword}
              onChange={(event) =>
                updateField("newPassword", event.target.value)
              }
              required
              minLength={8}
            />

            <label className="mt-4 block text-sm font-semibold">
              Confirm password
            </label>
            <input
              type="password"
              className="mt-2 w-full rounded-2xl border border-[#ead4bd] px-4 py-3 outline-none focus:border-[#c45f36]"
              value={form.confirmPassword}
              onChange={(event) =>
                updateField("confirmPassword", event.target.value)
              }
              required
              minLength={8}
            />

            {error ? (
              <div className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {successMessage ? (
              <div className="mt-5 rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-700">
                {successMessage}
              </div>
            ) : null}

            <button
              disabled={loading || !token}
              className="mt-6 w-full rounded-2xl bg-[#23170f] px-5 py-3 font-bold text-white transition hover:bg-[#3a2a1f] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Resetting..." : "Reset password"}
            </button>

            <Link
              href="/login"
              className="mt-5 block text-center text-sm font-semibold text-[#b65f38] hover:underline"
            >
              Back to login
            </Link>
          </form>
        </section>
      </main>
    </GuestOnly>
  );
}

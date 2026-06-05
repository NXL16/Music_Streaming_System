"use client";

import Link from "next/link";
import { GuestOnly } from "@/components/auth/guest-only";
import { useForgotPasswordForm } from "@/lib/auth/use-forgot-password-form";

export default function ForgotPasswordPage() {
  const { form, error, successMessage, loading, updateField, handleSubmit } =
    useForgotPasswordForm();

  return (
    <GuestOnly>
      <main className="min-h-screen bg-[#f7efe5] px-6 py-10 text-[#23170f]">
        <section className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_420px]">
          <div className="flex flex-col justify-center">
            <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#b65f38]">
              Password Recovery
            </p>

            <h1 className="mt-5 max-w-xl text-5xl font-black leading-tight">
              Reset access to your music workspace.
            </h1>

            <p className="mt-5 max-w-lg text-lg text-[#705846]">
              Enter your account email. If it exists, we will send a secure
              password reset link.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-4xl border border-[#ead4bd] bg-white p-7 shadow-[0_24px_80px_rgba(95,55,25,0.16)]"
          >
            <h2 className="text-2xl font-bold">Forgot password</h2>

            <label className="mt-6 block text-sm font-semibold">Email</label>
            <input
              type="email"
              className="mt-2 w-full rounded-2xl border border-[#ead4bd] px-4 py-3 outline-none focus:border-[#c45f36]"
              value={form.email}
              onChange={(event) => updateField("email", event.target.value)}
              required
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
              disabled={loading}
              className="mt-6 w-full rounded-2xl bg-[#23170f] px-5 py-3 font-bold text-white transition hover:bg-[#3a2a1f] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Sending..." : "Send reset link"}
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

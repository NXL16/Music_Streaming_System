"use client";

import Link from "next/link";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { GuestOnly } from "@/components/auth/guest-only";
import { useSignupForm } from "@/lib/auth/use-signup-form";

export default function SignupPage() {
  const { form, error, loading, updateField, handleSubmit } = useSignupForm();

  return (
    <GuestOnly>
      <AuthPageShell
        eyebrow="Musical Identity"
        title="Create your personal music workspace."
        description="Start building a library that keeps upload status, metadata, and security in sync."
      >
        <form onSubmit={handleSubmit}>
          <h2 className="text-2xl font-bold tracking-[-0.04em] text-[#1d1d1f] dark:text-white">
            Create account
          </h2>

          <label className="mt-6 block text-sm font-semibold text-[#1d1d1f] dark:text-neutral-200">
            Display name
          </label>
          <input
            className="mt-2 w-full rounded-2xl bg-[#f5f5f7] dark:bg-white/5 px-4 py-3 outline-none text-[#1d1d1f] dark:text-white ring-1 ring-[#d2d2d7] dark:ring-white/10 focus:ring-[#fa233b]"
            value={form.displayName}
            onChange={(event) => updateField("displayName", event.target.value)}
            required
            minLength={2}
          />

          <label className="mt-4 block text-sm font-semibold text-[#1d1d1f] dark:text-neutral-200">
            Username
          </label>
          <input
            className="mt-2 w-full rounded-2xl bg-[#f5f5f7] dark:bg-white/5 px-4 py-3 outline-none text-[#1d1d1f] dark:text-white ring-1 ring-[#d2d2d7] dark:ring-white/10 focus:ring-[#fa233b]"
            value={form.username}
            onChange={(event) => updateField("username", event.target.value)}
            required
            minLength={3}
          />

          <label className="mt-4 block text-sm font-semibold text-[#1d1d1f] dark:text-neutral-200">
            Email
          </label>
          <input
            type="email"
            className="mt-2 w-full rounded-2xl bg-[#f5f5f7] dark:bg-white/5 px-4 py-3 outline-none text-[#1d1d1f] dark:text-white ring-1 ring-[#d2d2d7] dark:ring-white/10 focus:ring-[#fa233b]"
            value={form.email}
            onChange={(event) => updateField("email", event.target.value)}
            required
          />

          <label className="mt-4 block text-sm font-semibold text-[#1d1d1f] dark:text-neutral-200">
            Password
          </label>
          <input
            type="password"
            className="mt-2 w-full rounded-2xl bg-[#f5f5f7] dark:bg-white/5 px-4 py-3 outline-none text-[#1d1d1f] dark:text-white ring-1 ring-[#d2d2d7] dark:ring-white/10 focus:ring-[#fa233b]"
            value={form.password}
            onChange={(event) => updateField("password", event.target.value)}
            required
            minLength={8}
          />

          <p className="mt-2 text-xs leading-5 text-[#6e6e73] dark:text-neutral-400">
            Password must include uppercase, lowercase, number, and special
            character.
          </p>

          {error && (
            <div className="mt-5 rounded-2xl bg-[#fff1f3] dark:bg-rose-950/20 px-4 py-3 text-sm font-medium text-[#d91d32] dark:text-rose-400 border border-rose-500/10">
              {error}
            </div>
          )}

          <button
            disabled={loading}
            className="mt-6 w-full rounded-full bg-[#fa233b] px-5 py-3 font-bold text-white transition hover:bg-[#d91d32] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>

          <p className="mt-5 text-center text-sm text-[#6e6e73] dark:text-neutral-400">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-[#fa233b]">
              Sign in
            </Link>
          </p>
        </form>
      </AuthPageShell>
    </GuestOnly>
  );
}

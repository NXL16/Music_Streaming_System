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
          <h2 className="text-2xl font-bold tracking-[-0.04em]">Create account</h2>

          <label className="mt-6 block text-sm font-semibold text-[#1d1d1f]">
            Display name
          </label>
          <input
            className="mt-2 w-full rounded-2xl bg-[#f5f5f7] px-4 py-3 outline-none ring-1 ring-[#d2d2d7] focus:ring-[#fa233b]"
            value={form.displayName}
            onChange={(event) => updateField("displayName", event.target.value)}
            required
            minLength={2}
          />

          <label className="mt-4 block text-sm font-semibold text-[#1d1d1f]">Username</label>
          <input
            className="mt-2 w-full rounded-2xl bg-[#f5f5f7] px-4 py-3 outline-none ring-1 ring-[#d2d2d7] focus:ring-[#fa233b]"
            value={form.username}
            onChange={(event) => updateField("username", event.target.value)}
            required
            minLength={3}
          />

          <label className="mt-4 block text-sm font-semibold text-[#1d1d1f]">Email</label>
          <input
            type="email"
            className="mt-2 w-full rounded-2xl bg-[#f5f5f7] px-4 py-3 outline-none ring-1 ring-[#d2d2d7] focus:ring-[#fa233b]"
            value={form.email}
            onChange={(event) => updateField("email", event.target.value)}
            required
          />

          <label className="mt-4 block text-sm font-semibold text-[#1d1d1f]">Password</label>
          <input
            type="password"
            className="mt-2 w-full rounded-2xl bg-[#f5f5f7] px-4 py-3 outline-none ring-1 ring-[#d2d2d7] focus:ring-[#fa233b]"
            value={form.password}
            onChange={(event) => updateField("password", event.target.value)}
            required
            minLength={8}
          />

          <p className="mt-2 text-xs leading-5 text-[#6e6e73]">
            Password must include uppercase, lowercase, number, and special
            character.
          </p>

          {error ? (
            <div className="mt-5 rounded-2xl bg-[#fff1f3] px-4 py-3 text-sm font-medium text-[#d91d32]">
              {error}
            </div>
          ) : null}

          <button
            disabled={loading}
            className="mt-6 w-full rounded-full bg-[#fa233b] px-5 py-3 font-bold text-white transition hover:bg-[#d91d32] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>

          <p className="mt-5 text-center text-sm text-[#6e6e73]">
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

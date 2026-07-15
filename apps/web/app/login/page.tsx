"use client";

import Link from "next/link";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { GuestOnly } from "@/components/auth/guest-only";
import { useGoogleLogin } from "@/lib/auth/use-google-login";
import { useLoginForm } from "@/lib/auth/use-login-form";

export default function LoginPage() {
  const { form, error, loading, updateField, handleSubmit } = useLoginForm();
  const { googleLoading, startGoogleLogin } = useGoogleLogin();

  return (
    <GuestOnly>
      <AuthPageShell
        eyebrow="Welcome Back"
        title="Listen, upload, and manage your music."
        description="Sign in to open your library. Refresh token stays protected in an HttpOnly cookie."
      >
        <form onSubmit={handleSubmit}>
          <h2 className="text-2xl font-bold tracking-[-0.04em] text-[#1d1d1f] dark:text-white">
            Sign in
          </h2>

          <label className="mt-6 block text-sm font-semibold text-[#1d1d1f] dark:text-neutral-200">
            Username or email
          </label>
          <input
            className="mt-2 w-full rounded-2xl bg-[#f5f5f7] dark:bg-white/5 px-4 py-3 outline-none text-[#1d1d1f] dark:text-white ring-1 ring-[#d2d2d7] dark:ring-white/10 focus:ring-[#fa233b]"
            value={form.identifier}
            onChange={(event) => updateField("identifier", event.target.value)}
            required
          />

          <div className="mt-4 flex items-center justify-between gap-3">
            <label className="block text-sm font-semibold text-[#1d1d1f] dark:text-neutral-200">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-sm font-semibold text-[#fa233b] hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          <input
            type="password"
            className="mt-2 w-full rounded-2xl bg-[#f5f5f7] dark:bg-white/5 px-4 py-3 outline-none text-[#1d1d1f] dark:text-white ring-1 ring-[#d2d2d7] dark:ring-white/10 focus:ring-[#fa233b]"
            value={form.password}
            onChange={(event) => updateField("password", event.target.value)}
            required
          />

          {error && (
            <div className="mt-5 rounded-2xl bg-[#fff1f3] dark:bg-rose-950/20 px-4 py-3 text-sm font-medium text-[#d91d32] dark:text-rose-400 border border-rose-500/10">
              {error}
            </div>
          )}

          <button
            disabled={loading}
            className="mt-6 w-full rounded-full bg-[#fa233b] px-5 py-3 font-bold text-white transition hover:bg-[#d91d32] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <div className="my-4 flex items-center gap-3 text-sm font-semibold text-[#86868b]">
            <div className="h-px flex-1 bg-[#e5e5ea] dark:bg-white/10" />
            or
            <div className="h-px flex-1 bg-[#e5e5ea] dark:bg-white/10" />
          </div>

          <button
            type="button"
            onClick={startGoogleLogin}
            disabled={googleLoading}
            className="w-full rounded-full bg-[#f2f2f7] dark:bg-white/10 px-5 py-3 font-bold text-[#1d1d1f] dark:text-white transition hover:bg-[#e5e5ea] dark:hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
          >
            {googleLoading ? "Opening Google..." : "Continue with Google"}
          </button>

          <p className="mt-5 text-center text-sm text-[#6e6e73] dark:text-neutral-400">
            New here?{" "}
            <Link href="/signup" className="font-semibold text-[#fa233b]">
              Create an account
            </Link>
          </p>
        </form>
      </AuthPageShell>
    </GuestOnly>
  );
}

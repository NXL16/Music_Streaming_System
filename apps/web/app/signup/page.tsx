"use client";

import { GuestOnly } from "@/components/auth/guest-only";
import { useSignupForm } from "@/lib/auth/use-signup-form";

export default function SignupPage() {
  const { form, error, loading, updateField, handleSubmit } = useSignupForm();

  return (
    <GuestOnly>
      <main className="min-h-screen bg-[#f7efe5] px-6 py-10 text-[#23170f]">
        <section className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_420px]">
          <div className="flex flex-col justify-center">
            <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#b65f38]">
              Musical Identity
            </p>

            <h1 className="mt-5 max-w-xl text-5xl font-black leading-tight">
              Create an account to start building your music library.
            </h1>

            <p className="mt-5 max-w-lg text-lg text-[#705846]">
              Refresh token is stored in an HttpOnly cookie. Frontend keeps only
              the access token in memory.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-4xl border border-[#ead4bd] bg-white p-7 shadow-[0_24px_80px_rgba(95,55,25,0.16)]"
          >
            <h2 className="text-2xl font-bold">Sign up</h2>

            <label className="mt-6 block text-sm font-semibold">
              Display name
            </label>
            <input
              className="mt-2 w-full rounded-2xl border border-[#ead4bd] px-4 py-3 outline-none focus:border-[#c45f36]"
              value={form.displayName}
              onChange={(event) =>
                updateField("displayName", event.target.value)
              }
              required
              minLength={2}
            />

            <label className="mt-4 block text-sm font-semibold">Username</label>
            <input
              className="mt-2 w-full rounded-2xl border border-[#ead4bd] px-4 py-3 outline-none focus:border-[#c45f36]"
              value={form.username}
              onChange={(event) => updateField("username", event.target.value)}
              required
              minLength={3}
            />

            <label className="mt-4 block text-sm font-semibold">Email</label>
            <input
              type="email"
              className="mt-2 w-full rounded-2xl border border-[#ead4bd] px-4 py-3 outline-none focus:border-[#c45f36]"
              value={form.email}
              onChange={(event) => updateField("email", event.target.value)}
              required
            />

            <label className="mt-4 block text-sm font-semibold">Password</label>
            <input
              type="password"
              className="mt-2 w-full rounded-2xl border border-[#ead4bd] px-4 py-3 outline-none focus:border-[#c45f36]"
              value={form.password}
              onChange={(event) => updateField("password", event.target.value)}
              required
              minLength={8}
            />

            <p className="mt-2 text-xs text-[#8c715d]">
              Password must include uppercase, lowercase, number, and special
              character.
            </p>

            {error ? (
              <div className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <button
              disabled={loading}
              className="mt-6 w-full rounded-2xl bg-[#23170f] px-5 py-3 font-bold text-white transition hover:bg-[#3a2a1f] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>
        </section>
      </main>
    </GuestOnly>
  );
}

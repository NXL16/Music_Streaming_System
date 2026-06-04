"use client";

import { GuestOnly } from "@/components/auth/guest-only";
import { useTwoFactorLoginForm } from "@/lib/auth/use-two-factor-login-form";

export default function TwoFactorLoginPage() {
  const { credential, error, loading, setCredential, handleSubmit } =
    useTwoFactorLoginForm();

  return (
    <GuestOnly>
      <main className="min-h-screen bg-[#f7efe5] px-6 py-10 text-[#23170f]">
        <section className="mx-auto max-w-md rounded-4xl border border-[#ead4bd] bg-white p-7 shadow-[0_24px_80px_rgba(95,55,25,0.16)]">
          <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#b65f38]">
            Two-Factor Auth
          </p>

          <h1 className="mt-4 text-3xl font-black">Enter 2FA code</h1>

          <p className="mt-3 text-sm text-[#705846]">
            Open your authenticator app and enter the 6-digit code.
          </p>

          <form onSubmit={handleSubmit} className="mt-6">
            <label className="block text-sm font-semibold">2FA code</label>
            <input
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              className="mt-2 w-full rounded-2xl border border-[#ead4bd] px-4 py-3 text-center text-2xl font-black tracking-[0.35em] outline-none focus:border-[#c45f36]"
              value={credential}
              onChange={(event) => setCredential(event.target.value)}
              required
            />

            {error ? (
              <div className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <button
              disabled={loading}
              className="mt-6 w-full rounded-2xl bg-[#23170f] px-5 py-3 font-bold text-white transition hover:bg-[#3a2a1f] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Verifying..." : "Verify"}
            </button>
          </form>
        </section>
      </main>
    </GuestOnly>
  );
}

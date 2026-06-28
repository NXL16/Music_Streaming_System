"use client";

import { useState } from "react";
import { AppButtonLink } from "@/components/layout/app-button-link";
import { PageHero } from "@/components/layout/page-hero";
import { ProtectedPageShell } from "@/components/layout/protected-page-shell";
import { ChangePasswordDialog } from "@/components/profile/change-password-dialog";
import { SessionsPanel } from "@/components/profile/sessions-panel";
import { TwoFactorPanel } from "@/components/profile/two-factor-panel";
import { useProfile } from "@/lib/auth/use-profile";

export default function SecuritySettingsPage() {
  const { user, loading, error } = useProfile();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  return (
    <ProtectedPageShell>
      <PageHero
        eyebrow="Security"
        title="Security settings"
        description="Manage password, two-factor authentication, and active sessions."
        actions={
          <>
            <AppButtonLink href="/settings/account">Account</AppButtonLink>
            <AppButtonLink href="/profile" variant="primary">
              Profile
            </AppButtonLink>
          </>
        }
      >
        {loading ? (
          <div className="mt-6 rounded-2xl bg-[#f5f5f7] px-4 py-3 text-sm font-semibold text-[#fa233b]">
            Syncing security status...
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </PageHero>

      <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-6">
          <section className="rounded-4xl border border-[#e5e5ea] bg-white p-6 shadow-[0_24px_80px_rgba(95,55,25,0.1)] md:p-8">
            <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#fa233b]">
              Password
            </p>
            <h2 className="mt-2 text-3xl font-black">Change password</h2>
            <p className="mt-3 leading-7 text-[#6e6e73]">
              Use a strong password and update it if you suspect any account risk.
            </p>
            <button
              type="button"
              onClick={() => setChangePasswordOpen(true)}
              className="mt-5 w-full rounded-2xl bg-[#1d1d1f] px-5 py-3 font-bold text-white transition hover:bg-[#333336]"
            >
              Change password
            </button>
          </section>

          <TwoFactorPanel user={user} />
        </aside>

        <div>
          <SessionsPanel className="mt-0" />
        </div>
      </div>

      <ChangePasswordDialog
        open={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />
    </ProtectedPageShell>
  );
}


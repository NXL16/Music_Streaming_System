"use client";

import { ActionCard } from "@/components/layout/action-card";
import { AppButtonLink } from "@/components/layout/app-button-link";
import { PageHero } from "@/components/layout/page-hero";
import { ProtectedPageShell } from "@/components/layout/protected-page-shell";
import { ProfileField } from "@/components/profile/profile-field";
import { useProfile } from "@/lib/auth/use-profile";
import { formatDateTime } from "@/lib/format/date";

const profileActions = [
  {
    href: "/settings/account",
    label: "Account",
    title: "Edit account details",
    description: "Manage display name, bio, avatar, and email verification.",
  },
  {
    href: "/settings/security",
    label: "Security",
    title: "Protect your account",
    description: "Change password, manage 2FA, and review active sessions.",
  },
] as const;

export default function ProfilePage() {
  const { user, loading, error } = useProfile();
  const avatarLetter = (user?.displayName || user?.username || "U")
    .charAt(0)
    .toUpperCase();

  return (
    <ProtectedPageShell>
      <PageHero
        eyebrow="Profile"
        title={user?.displayName || "Your profile"}
        description={user?.email || "View your account overview."}
        leading={
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-4xl bg-[#1d1d1f] text-4xl font-black text-white shadow-[0_18px_40px_rgba(35,23,15,0.22)]">
            {avatarLetter}
          </div>
        }
        actions={
          <>
            <AppButtonLink href="/dashboard">Dashboard</AppButtonLink>
            <AppButtonLink href="/settings/account" variant="primary">
              Account settings
            </AppButtonLink>
          </>
        }
      >
        {loading ? (
          <div className="mt-6 rounded-2xl bg-[#f5f5f7] px-4 py-3 text-sm font-semibold text-[#fa233b]">
            Syncing latest profile...
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </PageHero>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-4xl border border-[#e5e5ea] bg-white p-6 shadow-[0_24px_80px_rgba(95,55,25,0.1)] md:p-8">
          <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#fa233b]">
            Overview
          </p>
          <h2 className="mt-2 text-3xl font-black">Account snapshot</h2>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <ProfileField label="Username" value={user?.username} />
            <ProfileField label="Email" value={user?.email} />
            <ProfileField
              label="Email status"
              value={user?.emailVerified ? "Verified" : "Not verified"}
            />
            <ProfileField
              label="Account status"
              value={user?.isActive ? "Active" : "Disabled"}
            />
            <ProfileField
              label="Created at"
              value={formatDateTime(user?.createdAt)}
            />
            <ProfileField
              label="Last login"
              value={formatDateTime(user?.lastLoginAt)}
            />
          </div>
        </section>

        <aside className="rounded-4xl border border-[#e5e5ea] bg-white p-6 shadow-[0_24px_80px_rgba(95,55,25,0.1)] md:p-8">
          <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#fa233b]">
            Bio
          </p>
          <h2 className="mt-2 text-3xl font-black">About</h2>
          <p className="mt-5 leading-7 text-[#6e6e73]">
            {user?.bio || "No bio yet."}
          </p>
        </aside>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {profileActions.map((action) => (
          <ActionCard key={action.href} {...action} />
        ))}
      </div>
    </ProtectedPageShell>
  );
}


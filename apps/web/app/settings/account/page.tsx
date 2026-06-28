"use client";

import { useState } from "react";
import { AppButtonLink } from "@/components/layout/app-button-link";
import { PageHero } from "@/components/layout/page-hero";
import { ProtectedPageShell } from "@/components/layout/protected-page-shell";
import { EditProfileDialog } from "@/components/profile/edit-profile-dialog";
import { ProfileField } from "@/components/profile/profile-field";
import { useEmailVerificationRequest } from "@/lib/auth/use-email-verification-request";
import { useProfile } from "@/lib/auth/use-profile";
import { formatDateTime } from "@/lib/format/date";

export default function AccountSettingsPage() {
  const { user, loading, error } = useProfile();
  const verificationRequest = useEmailVerificationRequest();
  const [editOpen, setEditOpen] = useState(false);

  return (
    <ProtectedPageShell>
      <PageHero
        eyebrow="Account"
        title="Account settings"
        description="Edit profile information and keep your email status up to date."
        actions={
          <>
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="rounded-2xl bg-[#1d1d1f] px-5 py-3 font-bold text-white transition hover:bg-[#333336]"
            >
              Edit profile
            </button>
            <AppButtonLink href="/settings/security">Security</AppButtonLink>
            <AppButtonLink href="/profile">Profile</AppButtonLink>
          </>
        }
      >
        {loading ? (
          <div className="mt-6 rounded-2xl bg-[#f5f5f7] px-4 py-3 text-sm font-semibold text-[#fa233b]">
            Syncing latest account data...
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
            Details
          </p>
          <h2 className="mt-2 text-3xl font-black">Profile details</h2>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <ProfileField label="Display name" value={user?.displayName} />
            <ProfileField label="Username" value={user?.username} />
            <ProfileField label="Email" value={user?.email} />
            <ProfileField label="Role" value={user?.role} />
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

        <aside className="space-y-6">
          <section className="rounded-4xl border border-[#e5e5ea] bg-white p-6 shadow-[0_24px_80px_rgba(95,55,25,0.1)] md:p-8">
            <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#fa233b]">
              Email
            </p>
            <h2 className="mt-2 text-3xl font-black">
              {user?.emailVerified ? "Verified" : "Not verified"}
            </h2>
            <p className="mt-3 leading-7 text-[#6e6e73]">
              Verified email helps protect account recovery and security flows.
            </p>

            {!user?.emailVerified ? (
              <button
                type="button"
                onClick={() => void verificationRequest.sendVerificationEmail()}
                disabled={verificationRequest.loading}
                className="mt-5 w-full rounded-2xl bg-[#1d1d1f] px-5 py-3 font-bold text-white transition hover:bg-[#333336] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {verificationRequest.loading
                  ? "Sending..."
                  : "Send verification email"}
              </button>
            ) : null}

            {verificationRequest.message ? (
              <div className="mt-5 rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-700">
                {verificationRequest.message}
              </div>
            ) : null}

            {verificationRequest.error ? (
              <div className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {verificationRequest.error}
              </div>
            ) : null}
          </section>

          <section className="rounded-4xl border border-[#e5e5ea] bg-white p-6 shadow-[0_24px_80px_rgba(95,55,25,0.1)] md:p-8">
            <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#fa233b]">
              Bio
            </p>
            <h2 className="mt-2 text-3xl font-black">About</h2>
            <p className="mt-5 leading-7 text-[#6e6e73]">
              {user?.bio || "No bio yet."}
            </p>
          </section>
        </aside>
      </div>

      <EditProfileDialog open={editOpen} onClose={() => setEditOpen(false)} />
    </ProtectedPageShell>
  );
}


"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { AppButtonLink } from "@/components/layout/app-button-link";
import { SettingsTabs } from "@/components/layout/settings-tabs";
import {
  MusicPageHeading,
  MusicPageLayout,
  MusicPageSection,
} from "@/components/layout/music-page-layout";
import { EditProfileDialog } from "@/components/profile/edit-profile-dialog";
import { useEmailVerificationRequest } from "@/lib/auth/use-email-verification-request";
import { useProfile } from "@/lib/auth/use-profile";
import { formatDateTime } from "@/lib/format/date";

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(132px,.7fr)_1fr] gap-4 border-t border-(--labelDivider) py-3 text-(--systemPrimary)">
      <span className="text-(--systemSecondary) [font:var(--callout)]">
        {label}
      </span>
      <span className="min-w-0 truncate [font:var(--body-tall)]">
        {value || "—"}
      </span>
    </div>
  );
}

export default function AccountSettingsPage() {
  const { user, loading, error } = useProfile();
  const verificationRequest = useEmailVerificationRequest();
  const [editOpen, setEditOpen] = useState(false);

  return (
    <MusicPageLayout>
      <MusicPageHeading
        title="Account"
        trailing={
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="rounded-full bg-(--keyColor) px-4 py-2 text-(--keyColorText) [font:var(--callout-emphasized)]"
            >
              Edit profile
            </button>
            <AppButtonLink href="/settings/security">Security</AppButtonLink>
            <AppButtonLink href="/profile">Profile</AppButtonLink>
          </div>
        }
      />
      <SettingsTabs />

      <MusicPageSection title="Profile">
        <p className="mb-5 max-w-2xl text-(--systemSecondary) [font:var(--body-tall)]">
          Keep your public profile and sign-in details up to date.
        </p>

        {loading && (
          <p className="pb-4 text-(--systemSecondary) [font:var(--callout)]">
            Syncing latest account data…
          </p>
        )}
        {error && (
          <p className="pb-4 text-(--keyColor) [font:var(--callout)]">
            {error}
          </p>
        )}

        <div className="box-content -mx-0.5 w-full overflow-visible px-0.5">
          <DetailRow label="Display name" value={user?.displayName} />
          <DetailRow label="Username" value={user?.username} />
          <DetailRow label="Email" value={user?.email} />
          <DetailRow label="Role" value={user?.role} />
          <DetailRow label="Created" value={formatDateTime(user?.createdAt)} />
          <DetailRow
            label="Last sign-in"
            value={formatDateTime(user?.lastLoginAt)}
          />
        </div>
      </MusicPageSection>

      <MusicPageSection title="Email verification">
        <div className="border-t border-(--labelDivider) py-5">
          <p className="text-(--systemPrimary) [font:var(--body-tall-emphasized)]">
            {user?.emailVerified ? "Email verified" : "Email not verified"}
          </p>
          <p className="mt-1 max-w-2xl text-(--systemSecondary) [font:var(--callout)]">
            A verified email keeps account recovery and security notifications
            available to you.
          </p>

          {!user?.emailVerified && (
            <button
              type="button"
              onClick={() => void verificationRequest.sendVerificationEmail()}
              disabled={verificationRequest.loading}
              className="mt-4 rounded-full bg-(--keyColor) px-4 py-2 text-(--keyColorText) [font:var(--callout-emphasized)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {verificationRequest.loading
                ? "Sending…"
                : "Send verification email"}
            </button>
          )}

          {verificationRequest.message && (
            <p className="mt-3 text-(--statusPositive) [font:var(--callout)]">
              {verificationRequest.message}
            </p>
          )}
          {verificationRequest.error && (
            <p className="mt-3 text-(--keyColor) [font:var(--callout)]">
              {verificationRequest.error}
            </p>
          )}
        </div>
      </MusicPageSection>

      <MusicPageSection title="About">
        <p className="max-w-2xl border-t border-(--labelDivider) pt-5 whitespace-pre-wrap text-(--systemSecondary) [font:var(--body-tall)]">
          {user?.bio || "No bio yet."}
        </p>
      </MusicPageSection>

      <EditProfileDialog open={editOpen} onClose={() => setEditOpen(false)} />
    </MusicPageLayout>
  );
}

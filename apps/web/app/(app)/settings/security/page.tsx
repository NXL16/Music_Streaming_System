"use client";

import { useState } from "react";
import { AppButtonLink } from "@/components/layout/app-button-link";
import { SettingsTabs } from "@/components/layout/settings-tabs";
import {
  MusicPageHeading,
  MusicPageLayout,
  MusicPageSection,
} from "@/components/layout/music-page-layout";
import { ChangePasswordDialog } from "@/components/profile/change-password-dialog";
import { SessionsPanel } from "@/components/profile/sessions-panel";
import { TwoFactorPanel } from "@/components/profile/two-factor-panel";
import { useProfile } from "@/lib/auth/use-profile";

export default function SecuritySettingsPage() {
  const { user, loading, error } = useProfile();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  return (
    <MusicPageLayout>
      <MusicPageHeading
        title="Security"
        trailing={
          <div className="flex flex-wrap justify-end gap-2">
            <AppButtonLink href="/settings/account">Account</AppButtonLink>
            <AppButtonLink href="/profile">Profile</AppButtonLink>
          </div>
        }
      />
      <SettingsTabs />

      <MusicPageSection title="Password">
        <div className="border-t border-(--labelDivider) py-5">
          <p className="text-(--systemPrimary) [font:var(--body-tall-emphasized)]">
            Change password
          </p>
          <p className="mt-1 max-w-2xl text-(--systemSecondary) [font:var(--callout)]">
            Use a strong, unique password and change it if you suspect your
            account is at risk.
          </p>
          <button
            type="button"
            onClick={() => setChangePasswordOpen(true)}
            className="mt-4 rounded-full bg-(--keyColor) px-4 py-2 text-(--keyColorText) [font:var(--callout-emphasized)]"
          >
            Change password
          </button>
        </div>
      </MusicPageSection>

      <MusicPageSection title="Two-factor authentication">
        {loading && (
          <p className="pb-4 text-(--systemSecondary) [font:var(--callout)]">
            Syncing security status…
          </p>
        )}
        {error && (
          <p className="pb-4 text-(--keyColor) [font:var(--callout)]">
            {error}
          </p>
        )}
        <TwoFactorPanel user={user} />
      </MusicPageSection>

      <MusicPageSection title="Signed-in devices">
        <SessionsPanel className="mt-0" />
      </MusicPageSection>

      <ChangePasswordDialog
        open={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />
    </MusicPageLayout>
  );
}

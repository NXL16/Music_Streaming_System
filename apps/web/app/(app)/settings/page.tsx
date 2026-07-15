"use client";

import { ActionCard } from "@/components/layout/action-card";
import { AppButtonLink } from "@/components/layout/app-button-link";
import { PageHero } from "@/components/layout/page-hero";

const settingsSections = [
  {
    href: "/settings/account",
    label: "Account",
    title: "Account settings",
    description: "Edit your public account details and manage email verification.",
  },
  {
    href: "/settings/security",
    label: "Security",
    title: "Security settings",
    description: "Change password, configure 2FA, and manage logged-in devices.",
  },
] as const;

export default function SettingsPage() {
  return (
    <>
      <PageHero
        eyebrow="Settings"
        title="Manage your settings"
        description="Account and security settings are split so each page has one clear responsibility."
        actions={<AppButtonLink href="/profile">Back to profile</AppButtonLink>}
      />

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {settingsSections.map((section) => (
          <ActionCard key={section.href} {...section} />
        ))}
      </div>
    </>
  );
}

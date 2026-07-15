"use client";

import { ActionCard } from "@/components/layout/action-card";
import { AppButtonLink } from "@/components/layout/app-button-link";
import { PageHero } from "@/components/layout/page-hero";
import { useAuthStore } from "@/lib/auth/auth-store";

const quickActions = [
  {
    href: "/library",
    label: "Library",
    title: "Manage songs",
    description:
      "Upload tracks, follow processing status, and remove songs from your library.",
  },
  {
    href: "/deposit",
    label: "Nạp Coin",
    title: "Coin Recharge",
    description:
      "Top up your coin wallet balance via MoMo or Bank transfer to unlock premium benefits.",
  },
  {
    href: "/profile",
    label: "Profile",
    title: "Account settings",
    description:
      "Update your profile, security settings, 2FA, and active sessions.",
  },
] as const;

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);

  return (
    <>
      <PageHero
        eyebrow="Dashboard"
        title={<>Hello, {user?.displayName}</>}
        description="Your workspace for managing music, account security, and the next actions that matter."
        actions={
          <AppButtonLink href="/library" variant="primary">
            Open library
          </AppButtonLink>
        }
      />

      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {quickActions.map((action) => (
          <ActionCard key={action.href} {...action} />
        ))}
      </div>
    </>
  );
}

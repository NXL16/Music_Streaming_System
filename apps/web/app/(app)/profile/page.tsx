"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Coins } from "lucide-react";
import {
  MusicPageHeading,
  MusicPageLayout,
  MusicPageSection,
} from "@/components/layout/music-page-layout";
import { useProfile } from "@/lib/auth/use-profile";
import { formatDateTime } from "@/lib/format/date";
import { useWalletBalance } from "@/lib/wallet/use-wallet-balance";

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="group items-center text-(--systemPrimary) grid grid-cols-[minmax(130px,.7fr)_1fr] gap-4 pb-[7.5px] pt-[7.5px] relative w-full after:[border-top:var(--keyline-border-style)] after:content-[''] after:inset-e-0 after:inset-s-0 after:absolute after:top-0">
      <span className="text-(--systemSecondary) [font:var(--callout)]">
        {label}
      </span>
      <span className="truncate [font:var(--body-tall)]">{value || "—"}</span>
    </div>
  );
}

export default function ProfilePage() {
  const { user, loading, error } = useProfile();
  const { balance } = useWalletBalance();
  const name = user?.displayName || user?.username || "Profile";

  return (
    <MusicPageLayout>
      <MusicPageHeading
        title={name}
        trailing={
          <div className="flex gap-2">
            <Link
              href="/dashboard"
              className="rounded-full border border-(--labelDivider) px-4 py-2 text-(--systemPrimary) [font:var(--callout-emphasized)]"
            >
              Dashboard
            </Link>
            <Link
              href="/settings/account"
              className="rounded-full bg-(--keyColor) px-4 py-2 text-(--keyColorText) [font:var(--callout-emphasized)]"
            >
              Edit profile
            </Link>
          </div>
        }
      />
      <MusicPageSection title="Account">
        {loading && (
          <p className="pb-4 text-(--systemSecondary) [font:var(--callout)]">
            Syncing profile…
          </p>
        )}
        {error && (
          <p className="pb-4 text-(--keyColor) [font:var(--callout)]">
            {error}
          </p>
        )}
        <div className="box-content -me-0.5 -ms-0.5 overflow-visible pe-0.5 ps-0.5 w-full">
          <DetailRow label="Username" value={user?.username} />
          <DetailRow label="Email" value={user?.email} />
          <DetailRow
            label="Email status"
            value={user?.emailVerified ? "Verified" : "Not verified"}
          />
          <DetailRow
            label="Account status"
            value={user?.isActive ? "Active" : "Disabled"}
          />
          <DetailRow label="Created" value={formatDateTime(user?.createdAt)} />
          <DetailRow
            label="Last sign-in"
            value={formatDateTime(user?.lastLoginAt)}
          />
          <DetailRow
            label="Coin balance"
            value={
              <span className="inline-flex items-center gap-2 text-(--keyColor)">
                <Coins className="h-4 w-4" />
                {(balance?.coinBalance ?? 0).toLocaleString()} Coin{" "}
                <Link
                  href="/deposit"
                  className="ms-2 text-(--systemPrimary) underline"
                >
                  Top up
                </Link>
              </span>
            }
          />
        </div>
      </MusicPageSection>
      <MusicPageSection title="About">
        <p className="max-w-2xl text-(--systemSecondary) [font:var(--body-tall)]">
          {user?.bio || "No bio yet."}
        </p>
      </MusicPageSection>
      <MusicPageSection title="Settings">
        <div className="grid gap-5 md:grid-cols-2">
          <Link
            href="/settings/account"
            className="border-t border-(--labelDivider) py-5 text-(--systemPrimary)"
          >
            <strong className="[font:var(--body-tall-emphasized)]">
              Account
            </strong>
            <span className="mt-1 block text-(--systemSecondary) [font:var(--callout)]">
              Display name, bio, avatar and email verification.
            </span>
          </Link>
          <Link
            href="/settings/security"
            className="border-t border-(--labelDivider) py-5 text-(--systemPrimary)"
          >
            <strong className="[font:var(--body-tall-emphasized)]">
              Security
            </strong>
            <span className="mt-1 block text-(--systemSecondary) [font:var(--callout)]">
              Password, two-factor authentication and sessions.
            </span>
          </Link>
        </div>
      </MusicPageSection>
    </MusicPageLayout>
  );
}

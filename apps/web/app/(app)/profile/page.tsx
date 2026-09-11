"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  Coins,
  LoaderCircle,
  Mail,
  Pencil,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  MusicPageHeading,
  MusicPageLayout,
} from "@/components/layout/music-page-layout";
import { ChangePasswordPanel } from "@/components/profile/change-password-panel";
import { SessionsPanel } from "@/components/profile/sessions-panel";
import { TwoFactorPanel } from "@/components/profile/two-factor-panel";
import { useAvatarUpload } from "@/lib/auth/use-avatar-upload";
import { useEmailVerificationRequest } from "@/lib/auth/use-email-verification-request";
import { useProfileDetailsUpdate } from "@/lib/auth/use-profile-details-update";
import { useProfile } from "@/lib/auth/use-profile";
import { formatDateTime } from "@/lib/format/date";
import { useWalletBalance } from "@/lib/wallet/use-wallet-balance";

const tabs = [
  { id: "ho-so", label: "Profile" },
  { id: "bao-mat", label: "Security" },
  { id: "thiet-bi", label: "Devices" },
  { id: "vi", label: "Coin Wallet" },
] as const;

type TabId = (typeof tabs)[number]["id"];

function isTabId(value: string): value is TabId {
  return tabs.some((tab) => tab.id === value);
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid grid-cols-[minmax(9rem,.65fr)_1fr] gap-4 py-3 text-(--systemPrimary)">
      <dt className="text-(--systemSecondary) [font:var(--callout)]">
        {label}
      </dt>
      <dd className="min-w-0 truncate text-right [font:var(--body-tall-emphasized)]">
        {value || "—"}
      </dd>
    </div>
  );
}

function StatusRow({
  icon,
  title,
  description,
  positive,
}: {
  icon: "email" | "security";
  title: string;
  description: string;
  positive: boolean;
}) {
  const Icon = icon === "email" ? Mail : ShieldCheck;

  return (
    <div className="flex gap-3 py-4">
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${positive ? "text-(--statusPositive)" : "text-(--systemSecondary)"}`}
      />
      <div>
        <p className="text-(--systemPrimary) [font:var(--callout-emphasized)]">
          {title}
        </p>
        <p className="mt-1 text-(--systemSecondary) [font:var(--callout)]">
          {description}
        </p>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { user, loading, error } = useProfile();
  const { balance } = useWalletBalance();
  const verificationRequest = useEmailVerificationRequest();
  const {
    error: avatarError,
    loading: avatarUploading,
    uploadAvatar,
  } = useAvatarUpload();
  const profileDetails = useProfileDetailsUpdate();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<TabId>("ho-so");
  const [securityWorkspace, setSecurityWorkspace] = useState<
    "password" | "twoFactor" | null
  >(null);
  const [editingField, setEditingField] = useState<
    "displayName" | "bio" | null
  >(null);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [bioDraft, setBioDraft] = useState("");

  useEffect(() => {
    const syncTab = () => {
      const hash = window.location.hash.slice(1);
      if (isTabId(hash)) setActiveTab(hash);
    };

    syncTab();
    window.addEventListener("hashchange", syncTab);
    return () => window.removeEventListener("hashchange", syncTab);
  }, []);

  const name = user?.displayName || user?.username || "Your account";
  const coinBalance = (balance?.coinBalance ?? 0).toLocaleString();

  function selectTab(tabId: TabId) {
    setActiveTab(tabId);
    window.history.replaceState(null, "", `#${tabId}`);
  }

  function selectAvatar(file: File | null) {
    if (file) {
      void uploadAvatar(file);
    }
  }

  function startEditing(field: "displayName" | "bio") {
    setDisplayNameDraft(user?.displayName || user?.username || "");
    setBioDraft(user?.bio || "");
    setEditingField(field);
  }

  async function saveEditing() {
    const saved = await profileDetails.saveProfileDetails({
      displayName: displayNameDraft,
      bio: bioDraft,
    });

    if (saved) {
      setEditingField(null);
    }
  }

  return (
    <MusicPageLayout>
      <MusicPageHeading title="Account" />

      <section className="px-(--bodyGutter) pb-6 pt-2">
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarUploading}
            className="group relative h-20 w-20 shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-(--keyColor) focus-visible:ring-offset-2 focus-visible:ring-offset-(--background)"
            title="Change profile picture"
            aria-label="Change profile picture"
          >
            <Image
              src={user?.avatarUrl || "/assets/avatar.webp"}
              alt=""
              width={96}
              height={96}
              className="h-20 w-20 rounded-full object-cover transition duration-200 group-hover:brightness-75"
            />
            <span className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-(--background) bg-(--keyColor) text-(--keyColorText) shadow-sm transition group-hover:scale-105">
              {avatarUploading ? (
                <LoaderCircle
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Camera className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </span>
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="sr-only"
            onChange={(event) => {
              selectAvatar(event.target.files?.[0] ?? null);
              event.target.value = "";
            }}
          />
          <div className="min-w-0">
            <p className="text-(--systemSecondary) [font:var(--subhead-emphasized)]">
              YOUR PROFILE
            </p>
            {editingField === "displayName" ? (
              <form
                className="mt-1 flex max-w-md items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveEditing();
                }}
              >
                <input
                  autoFocus
                  value={displayNameDraft}
                  onChange={(event) => setDisplayNameDraft(event.target.value)}
                  maxLength={100}
                  className="min-w-0 flex-1 border-b border-(--labelDivider) bg-transparent py-1 text-(--systemPrimary) outline-none [font:var(--large-title-emphasized)] focus:border-(--keyColor)"
                  aria-label="Display name"
                />
                <button
                  type="submit"
                  disabled={profileDetails.loading}
                  className="rounded-full p-1.5 text-(--statusPositive) disabled:opacity-50"
                  aria-label="Save display name"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingField(null)}
                  disabled={profileDetails.loading}
                  className="rounded-full p-1.5 text-(--systemSecondary) disabled:opacity-50"
                  aria-label="Cancel editing display name"
                >
                  <X className="h-4 w-4" />
                </button>
              </form>
            ) : (
              <div className="mt-1 flex items-center gap-2">
                <h2 className="truncate text-(--systemPrimary) [font:var(--large-title-emphasized)]">
                  {name}
                </h2>
                <button
                  type="button"
                  onClick={() => startEditing("displayName")}
                  className="shrink-0 rounded-full p-1.5 text-(--systemSecondary) transition hover:bg-(--systemQuinary) hover:text-(--systemPrimary)"
                  aria-label="Edit display name"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <p className="mt-1 truncate text-(--systemSecondary) [font:var(--body-tall)]">
              {user?.email || "Loading account information…"}
            </p>
            {avatarError && (
              <p className="mt-1 text-(--keyColor) [font:var(--callout)]">
                {avatarError}
              </p>
            )}
            {editingField === "displayName" && profileDetails.error && (
              <p className="mt-1 text-(--keyColor) [font:var(--callout)]">
                {profileDetails.error}
              </p>
            )}
          </div>
        </div>
      </section>

      <nav
        aria-label="Các phần tài khoản"
        className="mb-6 flex gap-1 overflow-x-auto border-b border-(--labelDivider) px-(--bodyGutter)"
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectTab(tab.id)}
              className={`shrink-0 border-b-2 px-3 py-2.5 [font:var(--callout-emphasized)] transition ${active ? "border-(--keyColor) text-(--systemPrimary)" : "border-transparent text-(--systemSecondary) hover:text-(--systemPrimary)"}`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {activeTab === "ho-so" && (
        <section className="relative z-(--z-default) w-full px-(--bodyGutter) pb-8">
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1.45fr)_minmax(250px,.55fr)] xl:gap-12">
            <div>
              <div className="pb-4">
                <div>
                  <h3 className="text-(--systemPrimary) [font:var(--title-2-emphasized)]">
                    Personal information
                  </h3>
                  <p className="mt-1 text-(--systemSecondary) [font:var(--callout)]">
                    This information appears on your profile.
                  </p>
                </div>
              </div>

              {loading && (
                <p className="pb-4 text-(--systemSecondary) [font:var(--callout)]">
                  Đang đồng bộ thông tin…
                </p>
              )}
              {error && (
                <p className="pb-4 text-(--keyColor) [font:var(--callout)]">
                  {error}
                </p>
              )}
              <dl className="divide-y divide-(--labelDivider)">
                <DetailRow label="Display name" value={user?.displayName} />
                <DetailRow label="Username" value={user?.username} />
                <DetailRow label="Email" value={user?.email} />
                <DetailRow
                  label="Member since"
                  value={formatDateTime(user?.createdAt)}
                />
              </dl>
              <div className="mt-6">
                <div className="flex items-center gap-1">
                  <p className="text-(--systemSecondary) [font:var(--subhead-emphasized)]">
                    ABOUT
                  </p>
                  {editingField !== "bio" && (
                    <button
                      type="button"
                      onClick={() => startEditing("bio")}
                      className="rounded-full p-1 text-(--systemSecondary) transition hover:bg-(--systemQuinary) hover:text-(--systemPrimary)"
                      aria-label="Chỉnh sửa giới thiệu"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {editingField === "bio" ? (
                  <form
                    className="mt-2 max-w-xl"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveEditing();
                    }}
                  >
                    <textarea
                      autoFocus
                      value={bioDraft}
                      onChange={(event) => setBioDraft(event.target.value)}
                      maxLength={500}
                      rows={3}
                      className="w-full resize-y rounded-xl bg-(--systemQuinary) px-3 py-2 text-(--systemPrimary) outline-none ring-1 ring-transparent focus:ring-(--keyColor) [font:var(--body-tall)]"
                      aria-label="Giới thiệu"
                    />
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <p className="text-(--systemSecondary) [font:var(--caption-1)]">
                        {bioDraft.length}/500
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingField(null)}
                          disabled={profileDetails.loading}
                          className="rounded-full px-3 py-1.5 text-(--systemSecondary) [font:var(--callout-emphasized)]"
                        >
                          Hủy
                        </button>
                        <button
                          type="submit"
                          disabled={profileDetails.loading}
                          className="rounded-full bg-(--keyColor) px-3 py-1.5 text-(--keyColorText) [font:var(--callout-emphasized)]"
                        >
                          {profileDetails.loading ? "Đang lưu…" : "Lưu"}
                        </button>
                      </div>
                    </div>
                    {profileDetails.error && (
                      <p className="mt-2 text-(--keyColor) [font:var(--callout)]">
                        {profileDetails.error}
                      </p>
                    )}
                  </form>
                ) : (
                  <p className="mt-2 whitespace-pre-wrap text-(--systemPrimary) [font:var(--body-tall)]">
                    {user?.bio || "No introduction yet."}
                  </p>
                )}
              </div>
            </div>

            <aside>
              <h3 className="text-(--systemPrimary) [font:var(--title-2-emphasized)]">
                Account protection
              </h3>
              <div className="mt-4 divide-y divide-(--labelDivider)">
                <StatusRow
                  icon="email"
                  positive={Boolean(user?.emailVerified)}
                  title={
                    user?.emailVerified
                      ? "Email verified"
                      : "Email not verified"
                  }
                  description="Used to recover your account."
                />
                <StatusRow
                  icon="security"
                  positive={Boolean(user?.twoFactorEnabled)}
                  title={
                    user?.twoFactorEnabled
                      ? "Two-factor authentication is on"
                      : "Two-factor authentication is off"
                  }
                  description="Adds protection when you sign in."
                />
              </div>
            </aside>
          </div>

          {!user?.emailVerified && (
            <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-(--systemPrimary) [font:var(--body-tall-emphasized)]">
                  Verify your email address
                </p>
                <p className="mt-1 text-(--systemSecondary) [font:var(--callout)]">
                  We will send a verification link to your email.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void verificationRequest.sendVerificationEmail()}
                disabled={verificationRequest.loading}
                className="shrink-0 rounded-full bg-(--keyColor) px-4 py-2 text-(--keyColorText) [font:var(--callout-emphasized)] disabled:opacity-60"
              >
                {verificationRequest.loading ? "Sending…" : "Send email"}
              </button>
            </div>
          )}
          {(verificationRequest.message || verificationRequest.error) && (
            <p
              className={`mt-3 [font:var(--callout)] ${verificationRequest.error ? "text-(--keyColor)" : "text-(--statusPositive)"}`}
            >
              {verificationRequest.error || verificationRequest.message}
            </p>
          )}
        </section>
      )}

      {activeTab === "bao-mat" && (
        <section className="relative z-(--z-default) w-full px-(--bodyGutter) pb-8">
          <div className="max-w-3xl">
            <ChangePasswordPanel
              open={securityWorkspace === "password"}
              onToggle={() =>
                setSecurityWorkspace((current) =>
                  current === "password" ? null : "password",
                )
              }
            />
            <TwoFactorPanel
              user={user}
              open={securityWorkspace === "twoFactor"}
              onToggle={() =>
                setSecurityWorkspace((current) =>
                  current === "twoFactor" ? null : "twoFactor",
                )
              }
            />
          </div>
        </section>
      )}

      {activeTab === "thiet-bi" && (
        <section className="relative z-(--z-default) w-full px-(--bodyGutter) pb-8">
          <div className="max-w-4xl">
            <SessionsPanel className="mt-0" />
          </div>
        </section>
      )}

      {activeTab === "vi" && (
        <section className="relative z-(--z-default) w-full px-(--bodyGutter) pb-8">
          <div className="max-w-3xl py-2 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-(--systemSecondary) [font:var(--callout)]">
                Available balance
              </p>
              <p className="mt-1 flex items-center gap-2 text-(--systemPrimary) [font:var(--large-title-emphasized)]">
                <Coins className="h-6 w-6 text-(--keyColor)" />
                {coinBalance} Coin
              </p>
            </div>
            <Link
              href="/deposit"
              className="mt-4 inline-flex rounded-full bg-(--keyColor) px-5 py-2.5 text-(--keyColorText) [font:var(--callout-emphasized)] sm:mt-0"
            >
              Top Up Coin
            </Link>
          </div>
        </section>
      )}
    </MusicPageLayout>
  );
}

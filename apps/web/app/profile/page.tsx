"use client";

import { useState } from "react";
import Link from "next/link";
import { ProtectedOnly } from "@/components/auth/protected-only";
import { ChangePasswordDialog } from "@/components/profile/change-password-dialog";
import { EditProfileDialog } from "@/components/profile/edit-profile-dialog";
import { SessionsPanel } from "@/components/profile/sessions-panel";
import { TwoFactorPanel } from "@/components/profile/two-factor-panel";
import { useEmailVerificationRequest } from "@/lib/auth/use-email-verification-request";
import { useProfile } from "@/lib/auth/use-profile";
import { formatDateTime } from "@/lib/format/date";

function ProfileField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-[#ead4bd] bg-[#fffaf4] px-5 py-4">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#b65f38]">
        {label}
      </p>
      <div className="mt-2 wrap-break-word text-base font-semibold text-[#23170f]">
        {value}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { user, loading, error } = useProfile();
  const verificationRequest = useEmailVerificationRequest();
  const [editOpen, setEditOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const avatarLetter = (user?.displayName || user?.username || "U")
    .charAt(0)
    .toUpperCase();

  return (
    <ProtectedOnly>
      <main className="min-h-screen bg-[#f7efe5] px-6 py-10 text-[#23170f]">
        <section className="mx-auto max-w-6xl">
          <div className="rounded-4xl border border-[#ead4bd] bg-white p-6 shadow-[0_24px_80px_rgba(95,55,25,0.12)] md:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-4xl bg-[#23170f] text-4xl font-black text-white shadow-[0_18px_40px_rgba(35,23,15,0.22)]">
                  {avatarLetter}
                </div>

                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#b65f38]">
                    Profile
                  </p>

                  <h1 className="mt-3 text-4xl font-black leading-tight md:text-5xl">
                    {user?.displayName || "Your profile"}
                  </h1>

                  <p className="mt-2 text-base font-semibold text-[#705846]">
                    {user?.email}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:items-center">
                {loading ? (
                  <p className="rounded-2xl bg-[#fffaf4] px-4 py-3 text-sm font-semibold text-[#b65f38]">
                    Đang đồng bộ hồ sơ mới nhất...
                  </p>
                ) : null}

                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  className="inline-flex justify-center rounded-2xl border border-[#ead4bd] px-5 py-3 font-bold transition hover:border-[#c45f36]"
                >
                  Edit profile
                </button>

                <button
                  type="button"
                  onClick={() => setChangePasswordOpen(true)}
                  className="inline-flex justify-center rounded-2xl border border-[#ead4bd] px-5 py-3 font-bold transition hover:border-[#c45f36]"
                >
                  Change password
                </button>

                <Link
                  href="/dashboard"
                  className="inline-flex justify-center rounded-2xl bg-[#23170f] px-5 py-3 font-bold text-white transition hover:bg-[#3a2a1f]"
                >
                  Back to dashboard
                </Link>
              </div>
            </div>

            {error ? (
              <div className="mt-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-3xl bg-[#f7efe5] px-5 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#b65f38]">
                  Username
                </p>
                <p className="mt-2 wrap-break-word font-black">{user?.username}</p>
              </div>

              <div className="rounded-3xl bg-[#f7efe5] px-5 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#b65f38]">
                  Email status
                </p>
                <p className="mt-2 font-black">
                  {user?.emailVerified ? "Đã xác thực" : "Chưa xác thực"}
                </p>
                {!user?.emailVerified ? (
                  <button
                    type="button"
                    onClick={() =>
                      void verificationRequest.sendVerificationEmail()
                    }
                    disabled={verificationRequest.loading}
                    className="mt-4 rounded-2xl bg-[#23170f] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#3a2a1f] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {verificationRequest.loading
                      ? "Đang gửi..."
                      : "Gửi email xác thực"}
                  </button>
                ) : null}
              </div>

              <div className="rounded-3xl bg-[#f7efe5] px-5 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#b65f38]">
                  Account status
                </p>
                <p className="mt-2 font-black">
                  {user?.isActive ? "Đang hoạt động" : "Đã khóa"}
                </p>
              </div>

              <TwoFactorPanel user={user} />
            </div>

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
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
            <section className="rounded-4xl border border-[#ead4bd] bg-white p-6 shadow-[0_24px_80px_rgba(95,55,25,0.1)] md:p-8">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#b65f38]">
                    Account
                  </p>
                  <h2 className="mt-2 text-3xl font-black">
                    Account information
                  </h2>
                </div>
              </div>

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

            <aside className="rounded-4xl border border-[#ead4bd] bg-white p-6 shadow-[0_24px_80px_rgba(95,55,25,0.1)] md:p-8">
              <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#b65f38]">
                Bio
              </p>

              <h2 className="mt-2 text-3xl font-black">About</h2>

              <p className="mt-5 leading-7 text-[#705846]">
                {user?.bio || "Chưa có giới thiệu."}
              </p>
            </aside>
          </div>

          <SessionsPanel />
        </section>

        <EditProfileDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
        />

        <ChangePasswordDialog
          open={changePasswordOpen}
          onClose={() => setChangePasswordOpen(false)}
        />
      </main>
    </ProtectedOnly>
  );
}

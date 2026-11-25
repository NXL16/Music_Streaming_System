"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, Check, Pencil } from "lucide-react";
import { toast } from "sonner";
import { AUTH_DISPLAY_NAME_MAX_LENGTH } from "@musical/shared-constants";
import { Spinner } from "@/components/loading/spinner";
import { useAvatarUpload } from "@/lib/auth/use-avatar-upload";
import { useEmailVerificationRequest } from "@/lib/auth/use-email-verification-request";
import { useProfileDetailsUpdate } from "@/lib/auth/use-profile-details-update";
import { useProfile } from "@/lib/auth/use-profile";
import { formatDateTime } from "@/lib/format/date";
import styles from "./account-page.module.css";

export default function AccountPage() {
  const { user, error } = useProfile();
  const avatar = useAvatarUpload();
  const profile = useProfileDetailsUpdate();
  const verification = useEmailVerificationRequest();
  const avatarInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ displayName: "", bio: "" });
  const busy = profile.loading || avatar.loading;
  const name = user?.displayName || user?.username || "Your profile";

  useEffect(() => {
    if (editing) nameInput.current?.focus();
  }, [editing]);

  function editProfile() {
    profile.clearError();
    setDraft({
      displayName: user?.displayName || user?.username || "",
      bio: user?.bio || "",
    });
    setEditing(true);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (await profile.saveProfileDetails(draft)) {
      setEditing(false);
      toast.success("Profile updated.");
    }
  }

  async function changePhoto(file: File | undefined) {
    if (!file || busy) return;
    if (await avatar.uploadAvatar(file))
      toast.success("Profile picture updated.");
  }

  const activity = [
    { label: "Last sign-in", value: user?.lastLoginAt },
    { label: "Profile updated", value: user?.updatedAt },
  ];
  const role = user?.role
    ? user.role
        .toLowerCase()
        .replaceAll("_", " ")
        .replace(/^./, (letter) => letter.toUpperCase())
    : "Not available";

  return (
    <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width)">
      <div className="in-[.is-drawer-open]:min-[1260px]:pe-75 motion-safe:min-[1260px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)]">
        <div className={styles.page}>
          <header className="sr-only">
            <h1>Account</h1>
          </header>
          <section className={styles.profile} aria-label="Your profile">
            <div className={styles.summary}>
              <div className={styles.portrait}>
                {!editing && (
                  <button
                    type="button"
                    className={styles.editButton}
                    disabled={!user || busy}
                    onClick={editProfile}
                    aria-label="Edit profile"
                    title="Edit profile"
                  >
                    <Pencil size={19} aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  className={styles.avatar}
                  onClick={() => avatarInput.current?.click()}
                  disabled={!user || busy}
                  aria-label="Change profile picture"
                  aria-busy={avatar.loading}
                >
                  <Image
                    src={user?.avatarUrl || "/assets/avatar.webp"}
                    alt=""
                    width={160}
                    height={160}
                    sizes="(min-width: 768px) 120px, 96px"
                    className={styles.avatarImage}
                  />

                  <span className={styles.camera}>
                    {avatar.loading ? (
                      <Spinner size={18} />
                    ) : (
                      <Camera size={17} aria-hidden="true" />
                    )}
                  </span>
                </button>
                <input
                  ref={avatarInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  className="sr-only"
                  tabIndex={-1}
                  aria-label="Choose profile picture"
                  onChange={(event) => {
                    void changePhoto(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </div>

              <div className={styles.identity}>
                <h2>{name}</h2>
                <p className={styles.emailAddress}>
                  {user?.email || "Not available"}
                </p>
              </div>
            </div>
            {(error || avatar.error) && (
              <p className={styles.error} role="alert">
                {avatar.error || error}
              </p>
            )}
            {editing && (
              <form
                className={styles.editor}
                onSubmit={saveProfile}
                noValidate
                aria-label="Edit profile"
                aria-busy={profile.loading}
              >
                <div className={styles.fields}>
                  <div className={styles.field}>
                    <label htmlFor="profile-display-name">Display name</label>
                    <input
                      ref={nameInput}
                      id="profile-display-name"
                      name="displayName"
                      autoComplete="nickname"
                      value={draft.displayName}
                      maxLength={AUTH_DISPLAY_NAME_MAX_LENGTH}
                      disabled={profile.loading}
                      onChange={(event) => {
                        profile.clearError();
                        setDraft((current) => ({
                          ...current,
                          displayName: event.target.value,
                        }));
                      }}
                    />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="profile-bio">
                      Bio <span>Optional</span>
                    </label>
                    <textarea
                      id="profile-bio"
                      name="bio"
                      rows={3}
                      value={draft.bio}
                      maxLength={500}
                      disabled={profile.loading}
                      onChange={(event) => {
                        profile.clearError();
                        setDraft((current) => ({
                          ...current,
                          bio: event.target.value,
                        }));
                      }}
                    />
                    <span className={styles.counter}>
                      {draft.bio.length}/500
                    </span>
                  </div>
                </div>
                {profile.error && (
                  <p className={styles.error} role="alert">
                    {profile.error}
                  </p>
                )}
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.cancelButton}
                    disabled={profile.loading}
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={styles.saveButton}
                    disabled={busy}
                  >
                    {profile.loading ? "Saving..." : "Save changes"}
                  </button>
                </div>
              </form>
            )}
          </section>
          <div className={styles.detailGrid}>
            <section
              className={styles.section}
              aria-labelledby="personal-details"
            >
              <h2 id="personal-details" className={styles.sectionHeading}>
                Personal details
              </h2>
              <dl>
                <div className={styles.row}>
                  <dt>Display name</dt>
                  <dd>{user?.displayName || "Not set"}</dd>
                </div>
                <div className={styles.row}>
                  <dt>Username</dt>
                  <dd>{user?.username || "Not available"}</dd>
                </div>
                <div className={styles.row}>
                  <dt>Email address</dt>
                  <dd>{user?.email || "Not available"}</dd>
                </div>
                <div className={styles.row}>
                  <dt>Bio</dt>
                  <dd className={styles.bio}>{user?.bio || "No bio added."}</dd>
                </div>
              </dl>
            </section>
            <section
              className={styles.section}
              aria-labelledby="account-details"
            >
              <h2 id="account-details" className={styles.sectionHeading}>
                Account details
              </h2>
              <dl>
                <div className={styles.row}>
                  <dt>Role</dt>
                  <dd>{role}</dd>
                </div>
                <div className={styles.row}>
                  <dt>Status</dt>
                  <dd>
                    <span
                      className={
                        user?.isActive ? styles.positive : styles.secondary
                      }
                    >
                      {user
                        ? user.isActive
                          ? "Active"
                          : "Inactive"
                        : "Not available"}
                    </span>
                  </dd>
                </div>
                <div className={styles.row}>
                  <dt>Account created</dt>
                  <dd>
                    {user?.createdAt
                      ? formatDateTime(user.createdAt)
                      : "Not available"}
                  </dd>
                </div>
                <div className={styles.row}>
                  <dt>Account ID</dt>
                  <dd className={styles.accountId}>
                    {user?.userId || "Not available"}
                  </dd>
                </div>
              </dl>
            </section>
            <section
              className={styles.section}
              aria-labelledby="account-security"
            >
              <h2 id="account-security" className={styles.sectionHeading}>
                Security
              </h2>
              <dl>
                <div className={styles.row}>
                  <dt>Email verification</dt>
                  <dd>
                    <span
                      className={
                        user?.emailVerified ? styles.positive : styles.secondary
                      }
                    >
                      {user?.emailVerified && (
                        <Check size={13} aria-hidden="true" />
                      )}
                      {user?.emailVerified ? "Verified" : "Not verified"}
                    </span>
                    {user && !user.emailVerified && (
                      <button
                        type="button"
                        className={styles.verifyButton}
                        disabled={verification.loading}
                        onClick={() =>
                          void verification.sendVerificationEmail()
                        }
                      >
                        {verification.loading ? "Sending..." : "Verify email"}
                      </button>
                    )}
                  </dd>
                </div>
                <div className={styles.row}>
                  <dt>Two-factor authentication</dt>
                  <dd>
                    {user
                      ? user.twoFactorEnabled
                        ? "Enabled"
                        : "Not enabled"
                      : "Not available"}
                  </dd>
                </div>
              </dl>
              {(verification.message || verification.error) && (
                <p
                  className={verification.error ? styles.error : styles.notice}
                  role={verification.error ? "alert" : "status"}
                >
                  {verification.error || verification.message}
                </p>
              )}
            </section>
            <section
              className={styles.section}
              aria-labelledby="account-activity"
            >
              <h2 id="account-activity" className={styles.sectionHeading}>
                Account activity
              </h2>
              <dl>
                {activity.map(({ label, value }) => (
                  <div key={label} className={styles.row}>
                    <dt>{label}</dt>
                    <dd>{value ? formatDateTime(value) : "Not available"}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

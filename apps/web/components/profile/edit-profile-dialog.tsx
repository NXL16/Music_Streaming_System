"use client";

import { useEditProfileForm } from "@/lib/auth/use-edit-profile-form";

type EditProfileDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function EditProfileDialog({ open, onClose }: EditProfileDialogProps) {
  const {
    form,
    error,
    loading,
    avatarFile,
    updateField,
    selectAvatar,
    handleSubmit,
  } = useEditProfileForm(onClose);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-10050 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-md">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-(--labelDivider) bg-(--background) p-6 text-(--systemPrimary) shadow-[0_30px_100px_var(--glassMaterialShadowColor)] md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-(--keyColor) [font:var(--subhead-emphasized)]">
              Edit Profile
            </p>

            <h2 className="mt-3 [font:var(--large-title-semibold)]">
              Cập nhật hồ sơ
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-full border border-(--labelDivider) bg-(--systemQuinary) px-4 py-2 text-(--systemPrimary) [font:var(--callout-emphasized)] transition hover:bg-(--systemQuaternary)"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          <div>
            <label className="block text-(--systemPrimary) [font:var(--callout-emphasized)]">
              Display name
            </label>
            <input
              className="mt-2 w-full rounded-2xl border border-(--labelDivider) bg-(--systemQuinary) px-4 py-3 text-(--systemPrimary) outline-none focus:border-(--keyColor)"
              value={form.displayName}
              onChange={(event) =>
                updateField("displayName", event.target.value)
              }
              required
              minLength={2}
              maxLength={100}
            />
          </div>

          <div>
            <label className="block text-(--systemPrimary) [font:var(--callout-emphasized)]">
              Avatar
            </label>
            <input
              className="mt-2 w-full rounded-2xl border border-(--labelDivider) bg-(--systemQuinary) px-4 py-3 text-(--systemPrimary) outline-none focus:border-(--keyColor)"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              onChange={(event) =>
                selectAvatar(event.target.files?.[0] ?? null)
              }
            />
            <p className="mt-2 text-(--systemSecondary) [font:var(--callout)]">
              {avatarFile
                ? avatarFile.name
                : "JPEG, PNG, WebP hoặc AVIF — tối đa 5 MB"}
            </p>
          </div>

          <div>
            <label className="block text-(--systemPrimary) [font:var(--callout-emphasized)]">
              Bio
            </label>
            <textarea
              className="mt-2 min-h-36 w-full resize-y rounded-2xl border border-(--labelDivider) bg-(--systemQuinary) px-4 py-3 text-(--systemPrimary) outline-none focus:border-(--keyColor)"
              value={form.bio}
              onChange={(event) => updateField("bio", event.target.value)}
              maxLength={500}
              placeholder="Viết vài dòng về bạn..."
            />
            <p className="mt-2 text-(--systemSecondary) [font:var(--callout)]">
              {form.bio.length}/500
            </p>
          </div>

          {error && (
            <div className="rounded-2xl bg-(--statusNegativeBackground) px-4 py-3 text-(--keyColor) [font:var(--callout)]">
              {error}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-full border border-(--labelDivider) bg-(--systemQuinary) px-5 py-3 text-(--systemPrimary) [font:var(--callout-emphasized)] transition hover:bg-(--systemQuaternary)"
            >
              Huy
            </button>

            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-(--keyColor) px-5 py-3 text-(--keyColorText) [font:var(--callout-emphasized)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

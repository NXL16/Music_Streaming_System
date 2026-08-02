"use client";

import { useChangePasswordForm } from "@/lib/auth/use-change-password-form";

type ChangePasswordDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function ChangePasswordDialog({
  open,
  onClose,
}: ChangePasswordDialogProps) {
  const { form, error, loading, updateField, handleSubmit } =
    useChangePasswordForm();

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-10050 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-md">
      <div className="w-full max-w-xl rounded-[28px] border border-(--labelDivider) bg-(--background) p-6 text-(--systemPrimary) shadow-[0_30px_100px_var(--glassMaterialShadowColor)] md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-(--keyColor) [font:var(--subhead-emphasized)]">
              Security
            </p>

            <h2 className="mt-3 [font:var(--large-title-semibold)]">
              Đổi mật khẩu
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-full border border-(--labelDivider) bg-(--systemQuinary) px-4 py-2 text-(--systemPrimary) [font:var(--callout-emphasized)] transition hover:bg-(--systemQuaternary) disabled:cursor-not-allowed disabled:opacity-60"
          >
            Close
          </button>
        </div>

        <p className="mt-4 leading-6 text-(--systemSecondary) [font:var(--body-tall)]">
          Sau khi đổi mật khẩu thành công, bạn sẽ được đăng xuất và cần đăng
          nhập lại bằng mật khẩu mới
        </p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          <div>
            <label className="block text-(--systemPrimary) [font:var(--callout-emphasized)]">
              Current password
            </label>
            <input
              type="password"
              className="mt-2 w-full rounded-2xl border border-(--labelDivider) bg-(--systemQuinary) px-4 py-3 text-(--systemPrimary) outline-none focus:border-(--keyColor)"
              value={form.currentPassword}
              onChange={(event) =>
                updateField("currentPassword", event.target.value)
              }
              required
            />
          </div>

          <div>
            <label className="block text-(--systemPrimary) [font:var(--callout-emphasized)]">
              New password
            </label>
            <input
              type="password"
              className="mt-2 w-full rounded-2xl border border-(--labelDivider) bg-(--systemQuinary) px-4 py-3 text-(--systemPrimary) outline-none focus:border-(--keyColor)"
              value={form.newPassword}
              onChange={(event) =>
                updateField("newPassword", event.target.value)
              }
              required
              minLength={8}
            />
          </div>

          <div>
            <label className="block text-(--systemPrimary) [font:var(--callout-emphasized)]">
              Confirm new password
            </label>
            <input
              type="password"
              className="mt-2 w-full rounded-2xl border border-(--labelDivider) bg-(--systemQuinary) px-4 py-3 text-(--systemPrimary) outline-none focus:border-(--keyColor)"
              value={form.confirmPassword}
              onChange={(event) =>
                updateField("confirmPassword", event.target.value)
              }
              required
              minLength={8}
            />
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
              className="rounded-full border border-(--labelDivider) bg-(--systemQuinary) px-5 py-3 text-(--systemPrimary) [font:var(--callout-emphasized)] transition hover:bg-(--systemQuaternary) disabled:cursor-not-allowed disabled:opacity-60"
            >
              Huy
            </button>

            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-(--keyColor) px-5 py-3 text-(--keyColorText) [font:var(--callout-emphasized)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Đang đổi..." : "Đổi mật khẩu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

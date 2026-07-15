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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1d1d1f]/45 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-4xl border border-[#e5e5ea] bg-white p-6 text-[#1d1d1f] shadow-[0_30px_100px_rgba(35,23,15,0.32)] md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#fa233b]">
              Security
            </p>

            <h2 className="mt-3 text-3xl font-black">Đổi mật khẩu</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-2xl border border-[#e5e5ea] px-4 py-2 font-bold transition hover:border-[#fa233b] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Close
          </button>
        </div>

        <p className="mt-4 text-sm leading-6 text-[#6e6e73]">
          Sau khi đổi mật khẩu thành công, bạn sẽ được đăng xuất và cần đăng
          nhập lại bằng mật khẩu mới
        </p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          <div>
            <label className="block text-sm font-bold">Current password</label>
            <input
              type="password"
              className="mt-2 w-full rounded-2xl border border-[#e5e5ea] px-4 py-3 outline-none focus:border-[#fa233b]"
              value={form.currentPassword}
              onChange={(event) =>
                updateField("currentPassword", event.target.value)
              }
              required
            />
          </div>

          <div>
            <label className="block text-sm font-bold">New password</label>
            <input
              type="password"
              className="mt-2 w-full rounded-2xl border border-[#e5e5ea] px-4 py-3 outline-none focus:border-[#fa233b]"
              value={form.newPassword}
              onChange={(event) =>
                updateField("newPassword", event.target.value)
              }
              required
              minLength={8}
            />
          </div>

          <div>
            <label className="block text-sm font-bold">
              Confirm new password
            </label>
            <input
              type="password"
              className="mt-2 w-full rounded-2xl border border-[#e5e5ea] px-4 py-3 outline-none focus:border-[#fa233b]"
              value={form.confirmPassword}
              onChange={(event) =>
                updateField("confirmPassword", event.target.value)
              }
              required
              minLength={8}
            />
          </div>

          {error && (
            <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-2xl border border-[#e5e5ea] px-5 py-3 font-bold transition hover:border-[#fa233b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Huy
            </button>

            <button
              type="submit"
              disabled={loading}
              className="rounded-2xl bg-[#1d1d1f] px-5 py-3 font-bold text-white transition hover:bg-[#333336] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Đang đổi..." : "Đổi mật khẩu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

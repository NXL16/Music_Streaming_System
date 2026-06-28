"use client";

import { useEditProfileForm } from "@/lib/auth/use-edit-profile-form";

type EditProfileDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function EditProfileDialog({ open, onClose }: EditProfileDialogProps) {
  const { form, error, loading, updateField, handleSubmit } =
    useEditProfileForm(onClose);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1d1d1f]/45 px-4 py-8 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-4xl border border-[#e5e5ea] bg-white p-6 text-[#1d1d1f] shadow-[0_30px_100px_rgba(35,23,15,0.32)] md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#fa233b]">
              Edit Profile
            </p>

            <h2 className="mt-3 text-3xl font-black">Cập nhật hồ sơ</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-2xl border border-[#e5e5ea] px-4 py-2 font-bold transition hover:border-[#fa233b]"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          <div>
            <label className="block text-sm font-bold">Display name</label>
            <input
              className="mt-2 w-full rounded-2xl border border-[#e5e5ea] px-4 py-3 outline-none focus:border-[#fa233b]"
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
            <label className="block text-sm font-bold">Avatar URL</label>
            <input
              className="mt-2 w-full rounded-2xl border border-[#e5e5ea] px-4 py-3 outline-none focus:border-[#fa233b]"
              value={form.avatar}
              onChange={(event) => updateField("avatar", event.target.value)}
              maxLength={500}
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="block text-sm font-bold">Bio</label>
            <textarea
              className="mt-2 min-h-36 w-full resize-y rounded-2xl border border-[#e5e5ea] px-4 py-3 outline-none focus:border-[#fa233b]"
              value={form.bio}
              onChange={(event) => updateField("bio", event.target.value)}
              maxLength={500}
              placeholder="Viết vài dòng về bạn..."
            />
            <p className="mt-2 text-sm font-semibold text-[#6e6e73]">
              {form.bio.length}/500
            </p>
          </div>

          {error ? (
            <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-2xl border border-[#e5e5ea] px-5 py-3 font-bold transition hover:border-[#fa233b]"
            >
              Huy
            </button>

            <button
              type="submit"
              disabled={loading}
              className="rounded-2xl bg-[#1d1d1f] px-5 py-3 font-bold text-white transition hover:bg-[#333336] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


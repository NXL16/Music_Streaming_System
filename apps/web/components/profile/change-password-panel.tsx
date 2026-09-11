"use client";
import { useChangePasswordForm } from "@/lib/auth/use-change-password-form";
export function ChangePasswordPanel({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const { form, error, loading, updateField, handleSubmit } =
    useChangePasswordForm();
  return (
    <section className="py-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-(--systemPrimary) [font:var(--body-tall-emphasized)]">
            Password
          </h2>
          <p className="mt-1 text-(--systemSecondary) [font:var(--callout)]">
            Use a strong, unique password for this account.
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          disabled={loading}
          className="shrink-0 rounded-full border border-(--labelDivider) px-4 py-2 text-(--systemPrimary) [font:var(--callout-emphasized)]"
        >
          {open ? "Close" : "Change password"}
        </button>
      </div>
      {open && (
        <form
          onSubmit={handleSubmit}
          className="mt-6 max-w-xl border-t border-(--labelDivider) pt-6"
        >
          <p className="text-(--systemSecondary) [font:var(--callout)]">
            After changing your password, you will be signed out and must sign
            in again with the new password.
          </p>
          <div className="mt-5 space-y-4">
            {(
              [
                ["currentPassword", "Current password"],
                ["newPassword", "New password"],
                ["confirmPassword", "Confirm new password"],
              ] as const
            ).map(([field, label]) => (
              <label
                key={field}
                className="block text-(--systemPrimary) [font:var(--callout-emphasized)]"
              >
                {label}
                <input
                  type="password"
                  value={form[field]}
                  onChange={(e) => updateField(field, e.target.value)}
                  required
                  minLength={field === "currentPassword" ? undefined : 8}
                  className="mt-2 w-full border-b border-(--labelDivider) bg-transparent px-1 py-3 text-(--systemPrimary) outline-none focus:border-(--keyColor)"
                />
              </label>
            ))}
          </div>
          {error && (
            <p className="mt-4 text-(--keyColor) [font:var(--callout)]">
              {error}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onToggle}
              disabled={loading}
              className="rounded-full px-4 py-2 text-(--systemSecondary) [font:var(--callout-emphasized)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-(--keyColor) px-4 py-2 text-(--keyColorText) [font:var(--callout-emphasized)]"
            >
              {loading ? "Changing…" : "Save new password"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

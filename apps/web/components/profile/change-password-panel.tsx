"use client";

import { AuthInput } from "@/components/auth/auth-form";
import { PasswordRequirementsInput } from "@/components/auth/password-requirements-input";
import { ContentDialog } from "@/components/catalog/content-dialog";
import { useChangePasswordForm } from "@/lib/auth/use-change-password-form";
import styles from "./security-settings.module.css";

export function ChangePasswordPanel({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const auth = useChangePasswordForm();
  function close() {
    if (auth.loading || !open) return;
    auth.reset();
    onToggle();
  }
  return (
    <div className={styles.row}>
      <div>
        <h3>Password</h3>
        <p className={styles.description}>
          Use a strong, unique password for your account.
        </p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={styles.button}
        aria-haspopup="dialog"
      >
        Change password
      </button>
      <ContentDialog
        open={open}
        title="Change password"
        subtitle={
          auth.step === 1
            ? "Enter your current password to continue."
            : "Choose a new password. You will be signed out after saving."
        }
        onClose={close}
        hideGradient
        className={styles.dialog}
      >
        {open && (
          <form
            onSubmit={auth.handleSubmit}
            noValidate
            className={styles.form}
            aria-busy={auth.loading}
          >
            <p className={styles.notice}>Step {auth.step} of 2</p>
            <fieldset
              key={auth.step}
              disabled={auth.loading}
              className={styles.fields}
            >
              {(auth.step === 1
                ? ([["currentPassword", "Current password"]] as const)
                : ([
                    ["newPassword", "New password"],
                    ["confirmPassword", "Confirm new password"],
                  ] as const)
              ).map(([field, label], index) => {
                const inputProps = {
                  compact: true,
                  id: "change-" + field,
                  name: field,
                  label,
                  autoComplete:
                    field === "currentPassword"
                      ? "current-password"
                      : "new-password",
                  value: auth.form[field],
                  disabled: auth.loading,
                  autoFocus: index === 0,
                  onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                    auth.updateField(field, event.target.value),
                };
                return field === "newPassword" ? (
                  <PasswordRequirementsInput key={field} {...inputProps} />
                ) : (
                  <AuthInput key={field} {...inputProps} type="password" />
                );
              })}
            </fieldset>
            {auth.error && (
              <p role="alert" className={styles.error}>
                {auth.error}
              </p>
            )}
            <div className={styles.actions}>
              <button
                type="button"
                onClick={auth.step === 1 ? close : auth.back}
                disabled={auth.loading}
                className={styles.textButton}
              >
                {auth.step === 1 ? "Cancel" : "Back"}
              </button>
              <button
                type="submit"
                disabled={auth.loading}
                className={styles.primary}
              >
                {auth.loading
                  ? auth.step === 1
                    ? "Checking..."
                    : "Saving..."
                  : auth.step === 1
                    ? "Continue"
                    : "Change password"}
              </button>
            </div>
          </form>
        )}
      </ContentDialog>
    </div>
  );
}

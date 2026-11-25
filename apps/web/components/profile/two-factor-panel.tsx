"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Download } from "lucide-react";
import { AuthInput } from "@/components/auth/auth-form";
import { ContentDialog } from "@/components/catalog/content-dialog";
import type { UserProfile } from "@/lib/auth/auth.types";
import { useTwoFactorSettings } from "@/lib/auth/use-two-factor-settings";
import styles from "./security-settings.module.css";

function downloadRecoveryCodes(codes: string[]) {
  const blob = new Blob(
    [
      "404hz - Recovery codes\nKeep these codes somewhere safe. Each code can be used once.\n\n" +
        codes.join("\n"),
    ],
    { type: "text/plain;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "404hz-recovery-codes.txt";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function TwoFactorQrCode({ value }: { value: string }) {
  const [image, setImage] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    import("qrcode")
      .then((qr) =>
        qr.toDataURL(value, {
          errorCorrectionLevel: "M",
          margin: 2,
          scale: 6,
          color: { dark: "#1d1d1f", light: "#ffffff" },
        }),
      )
      .then((url) => {
        if (!cancelled) setImage(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);
  if (!image)
    return (
      <p className={styles.notice} role="status">
        {failed
          ? "The QR code could not be displayed. Use the setup key below."
          : "Preparing QR code..."}
      </p>
    );
  return (
    <Image
      width={180}
      height={180}
      unoptimized
      className={styles.qr}
      src={image}
      alt="Authenticator setup QR code"
    />
  );
}

export function TwoFactorPanel({
  user,
  open,
  onToggle,
}: {
  user: UserProfile | null;
  open: boolean;
  onToggle: () => void;
}) {
  const auth = useTwoFactorSettings();
  const [tool, setTool] = useState<"manage" | "recovery" | "disable">("manage");
  const enabled = Boolean(user?.twoFactorEnabled);
  const busy = auth.loadingAction !== null;
  function close() {
    if (busy || !open) return;
    auth.reset();
    setTool("manage");
    onToggle();
  }
  function launch() {
    onToggle();
    if (!enabled) void auth.startSetup();
  }
  const showingCodes = auth.recoveryCodes.length > 0;
  const title = showingCodes
    ? "Save your recovery codes"
    : !enabled
      ? "Set up two-factor authentication"
      : tool === "disable"
        ? "Turn off two-factor authentication"
        : tool === "recovery"
          ? "Replace recovery codes"
          : "Two-factor authentication";
  return (
    <div className={styles.row}>
      <div>
        <h3>Two-factor authentication</h3>
        <p className={styles.description}>
          {enabled
            ? "An extra layer of protection is enabled."
            : "Add a verification code when signing in."}
        </p>
      </div>
      <button
        type="button"
        className={styles.button}
        onClick={launch}
        disabled={!user || busy}
        aria-haspopup="dialog"
      >
        {enabled ? "Manage" : "Set up"}
      </button>
      <ContentDialog
        open={open}
        title={title}
        subtitle={
          showingCodes
            ? "Keep these somewhere safe. Each code can only be used once."
            : "Protect your account with an authenticator app."
        }
        onClose={close}
        hideGradient
        className={styles.dialog}
      >
        {open && (
          <div className={styles.form}>
            {auth.error && (
              <p role="alert" className={styles.error}>
                {auth.error}
              </p>
            )}
            {showingCodes ? (
              <>
                <div className={styles.codes}>
                  {auth.recoveryCodes.map((code) => (
                    <code key={code}>{code}</code>
                  ))}
                </div>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.button}
                    onClick={() => downloadRecoveryCodes(auth.recoveryCodes)}
                  >
                    <Download
                      size={16}
                      aria-hidden="true"
                      className="inline-block mr-2"
                    />
                    Download
                  </button>
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={close}
                  >
                    Done
                  </button>
                </div>
              </>
            ) : !enabled ? (
              auth.setupData ? (
                <>
                  <TwoFactorQrCode value={auth.setupData.otpauthUrl} />
                  <details className={styles.notice}>
                    <summary>Can&apos;t scan the QR code?</summary>
                    <p className="break-all mt-2 select-all">
                      {auth.setupData.secret}
                    </p>
                  </details>
                  <form
                    onSubmit={auth.confirmSetup}
                    noValidate
                    className={styles.form}
                    aria-busy={busy}
                  >
                    <AuthInput
                      compact
                      id="two-factor-setup-code"
                      label="Verification code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={auth.confirmCode}
                      disabled={busy}
                      onChange={(event) =>
                        auth.setConfirmCode(event.target.value)
                      }
                    />
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.textButton}
                        onClick={close}
                        disabled={busy}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className={styles.primary}
                        disabled={busy}
                      >
                        {busy
                          ? "Verifying..."
                          : "Enable two-factor authentication"}
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <p role="status" className={styles.notice}>
                    {busy ? "Preparing setup..." : "Try again to start setup."}
                  </p>
                  {!busy && (
                    <button
                      type="button"
                      className={styles.primary}
                      onClick={() => void auth.startSetup()}
                    >
                      Try again
                    </button>
                  )}
                </>
              )
            ) : tool === "manage" ? (
              <div className={styles.tools}>
                <p className={styles.notice}>
                  Two-factor authentication is enabled.
                </p>
                <button
                  type="button"
                  className={styles.button}
                  onClick={() => setTool("recovery")}
                >
                  Replace recovery codes
                </button>
                <button
                  type="button"
                  className={styles.button}
                  onClick={() => setTool("disable")}
                >
                  Turn off two-factor authentication
                </button>
              </div>
            ) : (
              <form
                className={styles.form}
                noValidate
                aria-busy={busy}
                onSubmit={
                  tool === "recovery"
                    ? auth.regenerateRecoveryCodes
                    : auth.disable
                }
              >
                <p className={styles.notice}>
                  {tool === "recovery"
                    ? "New codes will replace all of your previous recovery codes."
                    : "You will be signed out after turning off two-factor authentication."}
                </p>
                <fieldset className={styles.fields} disabled={busy}>
                  <AuthInput
                    compact
                    id="two-factor-password"
                    label="Password"
                    disabled={busy}
                    type="password"
                    autoComplete="current-password"
                    value={
                      tool === "recovery"
                        ? auth.regenerateForm.password
                        : auth.disableForm.password
                    }
                    onChange={(event) =>
                      tool === "recovery"
                        ? auth.updateRegenerateField(
                            "password",
                            event.target.value,
                          )
                        : auth.updateDisableField(
                            "password",
                            event.target.value,
                          )
                    }
                  />
                  <AuthInput
                    compact
                    id="two-factor-verification"
                    label="Verification or recovery code"
                    disabled={busy}
                    autoComplete="one-time-code"
                    value={
                      tool === "recovery"
                        ? auth.regenerateForm.verificationInput
                        : auth.disableForm.verificationInput
                    }
                    onChange={(event) =>
                      tool === "recovery"
                        ? auth.updateRegenerateField(
                            "verificationInput",
                            event.target.value,
                          )
                        : auth.updateDisableField(
                            "verificationInput",
                            event.target.value,
                          )
                    }
                  />
                </fieldset>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.textButton}
                    disabled={busy}
                    onClick={() => {
                      auth.reset();
                      setTool("manage");
                    }}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className={styles.primary}
                    disabled={busy}
                  >
                    {busy
                      ? "Saving..."
                      : tool === "recovery"
                        ? "Replace codes"
                        : "Turn off"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </ContentDialog>
    </div>
  );
}

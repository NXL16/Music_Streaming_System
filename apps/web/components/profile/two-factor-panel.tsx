"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { UserProfile } from "@/lib/auth/auth.types";
import { useTwoFactorSettings } from "@/lib/auth/use-two-factor-settings";

type TwoFactorPanelProps = {
  user: UserProfile | null;
};

function downloadRecoveryCodes(codes: string[]) {
  const content = [
    "Music Streaming System - 2FA Recovery Codes",
    "",
    "Lưu các mã này ở nơi an toàn. Mỗi mã chỉ được dùng một lần.",
    "",
    ...codes,
    "",
  ].join("\n");
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `mss-recovery-codes.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function RecoveryCodesBox({ codes }: { codes: string[] }) {
  if (codes.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-(--labelDivider) bg-(--systemQuinary) p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-(--systemPrimary) [font:var(--body-tall-emphasized)]">
          Recovery codes
        </p>

        <button
          type="button"
          onClick={() => downloadRecoveryCodes(codes)}
          className="rounded-full bg-(--keyColor) px-4 py-2 text-(--keyColorText) [font:var(--callout-emphasized)]"
        >
          Tải về
        </button>
      </div>

      <p className="mt-1 leading-6 text-(--systemSecondary) [font:var(--callout)]">
        Tải và lưu file ở nơi an toàn. Mỗi mã chỉ dùng được một lần.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {codes.map((code) => (
          <code
            key={code}
            className="rounded-xl border border-(--labelDivider) bg-(--background) px-3 py-2 text-(--systemPrimary) [font:var(--callout-emphasized)] tracking-[0.12em]"
          >
            {code}
          </code>
        ))}
      </div>
    </div>
  );
}

function TwoFactorQrCode({ value }: { value: string }) {
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function renderQrCode() {
      const QRCode = await import("qrcode");
      const url = await QRCode.toDataURL(value, {
        errorCorrectionLevel: "M",
        margin: 2,
        scale: 8,
        color: {
          dark: "#1d1d1f",
          light: "#f5f5f7",
        },
      });

      if (!cancelled) {
        setDataUrl(url);
      }
    }

    void renderQrCode();

    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!dataUrl) {
    return (
      <div className="flex aspect-square w-full max-w-64 items-center justify-center rounded-3xl bg-(--systemQuinary) text-(--systemSecondary) [font:var(--callout-emphasized)]">
        Đang tạo QR...
      </div>
    );
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={dataUrl}
        alt="Two-factor authentication QR code"
        className="aspect-square w-full max-w-64 rounded-3xl border border-(--labelDivider) bg-white p-3"
      />
    </>
  );
}

function TwoFactorDialog({
  enabled,
  onClose,
  twoFactor,
}: {
  enabled: boolean;
  onClose: () => void;
  twoFactor: ReturnType<typeof useTwoFactorSettings>;
}) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-10050 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-md">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[28px] border border-(--labelDivider) bg-(--background) p-6 text-(--systemPrimary) shadow-[0_30px_100px_var(--glassMaterialShadowColor)] md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-(--keyColor) [font:var(--subhead-emphasized)]">
              Security
            </p>
            <h2 className="mt-3 [font:var(--large-title-semibold)]">
              Two-factor authentication
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={twoFactor.loadingAction !== null}
            className="rounded-full border border-(--labelDivider) bg-(--systemQuinary) px-4 py-2 text-(--systemPrimary) [font:var(--callout-emphasized)] transition hover:bg-(--systemQuaternary) disabled:cursor-not-allowed disabled:opacity-60"
          >
            Close
          </button>
        </div>

        {twoFactor.message && (
          <div className="mt-5 rounded-2xl bg-(--statusPositiveBackground) px-4 py-3 text-(--statusPositive) [font:var(--callout)]">
            {twoFactor.message}
          </div>
        )}

        {twoFactor.error && (
          <div className="mt-5 rounded-2xl bg-(--statusNegativeBackground) px-4 py-3 text-(--keyColor) [font:var(--callout)]">
            {twoFactor.error}
          </div>
        )}

        <div className="mt-6 space-y-5">
          {!enabled && twoFactor.recoveryCodes.length === 0 ? (
            <div className="grid gap-6 lg:grid-cols-[280px_1fr] lg:items-start">
              <div className="flex justify-center lg:justify-start">
                {twoFactor.setupData ? (
                  <TwoFactorQrCode value={twoFactor.setupData.otpauthUrl} />
                ) : (
                  <div className="flex aspect-square w-full max-w-64 items-center justify-center rounded-3xl bg-(--systemQuinary) px-6 text-center leading-6 text-(--systemSecondary) [font:var(--callout-emphasized)]">
                    Bấm tạo QR để bắt đầu thiết lập 2FA.
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-(--labelDivider) bg-(--systemQuinary) p-5">
                {!twoFactor.setupData ? (
                  <div className="space-y-4">
                    <p className="leading-6 text-(--systemSecondary) [font:var(--body-tall)]">
                      Hệ thống sẽ tạo QR nội bộ. Quét QR bằng Google
                      Authenticator hoặc ứng dụng tương tự, sau đó nhập mã 6 số
                      để bật 2FA.
                    </p>

                    <button
                      type="button"
                      onClick={() => void twoFactor.startSetup()}
                      disabled={twoFactor.loadingAction !== null}
                      className="rounded-full bg-(--keyColor) px-5 py-3 text-(--keyColorText) [font:var(--callout-emphasized)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {twoFactor.loadingAction === "setup"
                        ? "Đang tạo QR..."
                        : "Tạo QR"}
                    </button>
                  </div>
                ) : (
                  <form onSubmit={twoFactor.confirmSetup} className="space-y-4">
                    <div>
                      <label className="block text-(--systemPrimary) [font:var(--callout-emphasized)]">
                        Mã 6 số từ Authenticator
                      </label>
                      <input
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        className="mt-2 w-full rounded-2xl border border-(--labelDivider) bg-(--background) px-4 py-3 text-center text-xl text-(--systemPrimary) [font:var(--large-title-semibold)] tracking-[0.28em] outline-none focus:border-(--keyColor)"
                        value={twoFactor.confirmCode}
                        onChange={(event) =>
                          twoFactor.setConfirmCode(event.target.value)
                        }
                        required
                      />
                    </div>

                    <div className="flex flex-wrap justify-end gap-3">
                      <button
                        type="button"
                        onClick={twoFactor.cancelSetup}
                        disabled={twoFactor.loadingAction !== null}
                        className="rounded-full border border-(--labelDivider) bg-(--background) px-5 py-3 text-(--systemPrimary) [font:var(--callout-emphasized)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Hủy
                      </button>

                      <button
                        type="submit"
                        disabled={twoFactor.loadingAction !== null}
                        className="rounded-full bg-(--keyColor) px-5 py-3 text-(--keyColorText) [font:var(--callout-emphasized)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {twoFactor.loadingAction === "confirm"
                          ? "Đang xác nhận..."
                          : "Xác nhận bật 2FA"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              {enabled && (
                <>
                  <form
                    onSubmit={twoFactor.disable}
                    className="rounded-3xl border border-(--labelDivider) bg-(--systemQuinary) p-5"
                  >
                    <h3 className="text-(--systemPrimary) [font:var(--title-2-emphasized)]">
                      Tắt 2FA
                    </h3>
                    <p className="mt-2 leading-6 text-(--systemSecondary) [font:var(--callout)]">
                      Sau khi tắt 2FA, bạn sẽ được đăng xuất và cần đăng nhập
                      lại.
                    </p>

                    <div className="mt-5 space-y-4">
                      <input
                        type="password"
                        placeholder="Mật khẩu"
                        className="w-full rounded-2xl border border-(--labelDivider) bg-(--background) px-4 py-3 text-(--systemPrimary) outline-none focus:border-(--keyColor)"
                        value={twoFactor.disableForm.password}
                        onChange={(event) =>
                          twoFactor.updateDisableField(
                            "password",
                            event.target.value,
                          )
                        }
                        required
                      />

                      <input
                        placeholder="Mã 2FA hoặc recovery code"
                        className="w-full rounded-2xl border border-(--labelDivider) bg-(--background) px-4 py-3 text-(--systemPrimary) outline-none focus:border-(--keyColor)"
                        value={twoFactor.disableForm.verificationInput}
                        onChange={(event) =>
                          twoFactor.updateDisableField(
                            "verificationInput",
                            event.target.value,
                          )
                        }
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={twoFactor.loadingAction !== null}
                      className="mt-5 w-full rounded-full bg-(--keyColor) px-5 py-3 text-(--keyColorText) [font:var(--callout-emphasized)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {twoFactor.loadingAction === "disable"
                        ? "Đang tắt..."
                        : "Tắt 2FA"}
                    </button>
                  </form>

                  <form
                    onSubmit={twoFactor.regenerateRecoveryCodes}
                    className="rounded-3xl border border-(--labelDivider) bg-(--systemQuinary) p-5"
                  >
                    <h3 className="text-(--systemPrimary) [font:var(--title-2-emphasized)]">
                      Tạo lại recovery codes
                    </h3>
                    <p className="mt-2 leading-6 text-(--systemSecondary) [font:var(--callout)]">
                      Codes mới sẽ thay thế toàn bộ recovery codes cũ.
                    </p>

                    <div className="mt-5 space-y-4">
                      <input
                        type="password"
                        placeholder="Mật khẩu"
                        className="w-full rounded-2xl border border-(--labelDivider) bg-(--background) px-4 py-3 text-(--systemPrimary) outline-none focus:border-(--keyColor)"
                        value={twoFactor.regenerateForm.password}
                        onChange={(event) =>
                          twoFactor.updateRegenerateField(
                            "password",
                            event.target.value,
                          )
                        }
                        required
                      />

                      <input
                        placeholder="Mã 2FA hoặc recovery code"
                        className="w-full rounded-2xl border border-(--labelDivider) bg-(--background) px-4 py-3 text-(--systemPrimary) outline-none focus:border-(--keyColor)"
                        value={twoFactor.regenerateForm.verificationInput}
                        onChange={(event) =>
                          twoFactor.updateRegenerateField(
                            "verificationInput",
                            event.target.value,
                          )
                        }
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={twoFactor.loadingAction !== null}
                      className="mt-5 w-full rounded-full border border-(--labelDivider) bg-(--background) px-5 py-3 text-(--systemPrimary) [font:var(--callout-emphasized)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {twoFactor.loadingAction === "regenerate"
                        ? "Đang tạo..."
                        : "Tạo lại recovery codes"}
                    </button>
                  </form>
                </>
              )}
            </div>
          )}

          <RecoveryCodesBox codes={twoFactor.recoveryCodes} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function TwoFactorPanel({ user }: TwoFactorPanelProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const twoFactor = useTwoFactorSettings();
  const enabled = Boolean(user?.twoFactorEnabled);

  return (
    <>
      <div className="border-t border-(--labelDivider) py-5">
        <p className="text-(--systemPrimary) [font:var(--body-tall-emphasized)]">
          {enabled
            ? "Two-factor authentication is on"
            : "Two-factor authentication is off"}
        </p>
        <p className="mt-1 text-(--systemSecondary) [font:var(--callout)]">
          Add an authenticator code when signing in to better protect your
          account.
        </p>

        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="mt-4 rounded-full bg-(--keyColor) px-4 py-2 text-(--keyColorText) [font:var(--callout-emphasized)]"
        >
          {enabled ? "Quản lý 2FA" : "Bật 2FA"}
        </button>
      </div>

      {dialogOpen && (
        <TwoFactorDialog
          enabled={enabled}
          onClose={() => setDialogOpen(false)}
          twoFactor={twoFactor}
        />
      )}
    </>
  );
}

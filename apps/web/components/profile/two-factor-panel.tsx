"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { UserProfile } from "@/lib/auth/auth.types";
import { useTwoFactorSettings } from "@/lib/auth/use-two-factor-settings";
import Image from "next/image";

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
    <div className="rounded-3xl border border-[#e5e5ea] bg-[#f5f5f7] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-black text-[#1d1d1f]">Recovery codes</p>

        <button
          type="button"
          onClick={() => downloadRecoveryCodes(codes)}
          className="rounded-2xl bg-[#1d1d1f] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#333336]"
        >
          Tải về
        </button>
      </div>

      <p className="mt-1 text-sm leading-6 text-[#6e6e73]">
        Tải và lưu file ở nơi an toàn. Mỗi mã chỉ dùng được một lần.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {codes.map((code) => (
          <code
            key={code}
            className="rounded-2xl bg-white px-3 py-2 text-sm font-black tracking-[0.12em] text-[#1d1d1f]"
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
      <div className="flex aspect-square w-full max-w-64 items-center justify-center rounded-3xl bg-[#f5f5f7] text-sm font-bold text-[#6e6e73]">
        Đang tạo QR...
      </div>
    );
  }

  return (
    <Image
      src={dataUrl}
      alt="Two-factor authentication QR code"
      className="aspect-square w-full max-w-64 rounded-3xl border border-[#e5e5ea] bg-[#f5f5f7] p-3"
    />
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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1d1d1f]/45 px-4 py-8 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-4xl border border-[#e5e5ea] bg-white p-6 text-[#1d1d1f] shadow-[0_30px_100px_rgba(35,23,15,0.32)] md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#fa233b]">
              Security
            </p>
            <h2 className="mt-3 text-3xl font-black">
              Two-factor authentication
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={twoFactor.loadingAction !== null}
            className="rounded-2xl border border-[#e5e5ea] px-4 py-2 font-bold transition hover:border-[#fa233b] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Close
          </button>
        </div>

        {twoFactor.message ? (
          <div className="mt-5 rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-700">
            {twoFactor.message}
          </div>
        ) : null}

        {twoFactor.error ? (
          <div className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {twoFactor.error}
          </div>
        ) : null}

        <div className="mt-6 space-y-5">
          {!enabled && twoFactor.recoveryCodes.length === 0 ? (
            <div className="grid gap-6 lg:grid-cols-[280px_1fr] lg:items-start">
              <div className="flex justify-center lg:justify-start">
                {twoFactor.setupData ? (
                  <TwoFactorQrCode value={twoFactor.setupData.otpauthUrl} />
                ) : (
                  <div className="flex aspect-square w-full max-w-64 items-center justify-center rounded-3xl bg-[#f5f5f7] px-6 text-center text-sm font-bold leading-6 text-[#6e6e73]">
                    Bấm tạo QR để bắt đầu thiết lập 2FA.
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-[#e5e5ea] bg-[#f5f5f7] p-5">
                {!twoFactor.setupData ? (
                  <div className="space-y-4">
                    <p className="leading-7 text-[#6e6e73]">
                      Hệ thống sẽ tạo QR nội bộ. Quét QR bằng Google
                      Authenticator hoặc ứng dụng tương tự, sau đó nhập mã 6 số
                      để bật 2FA.
                    </p>

                    <button
                      type="button"
                      onClick={() => void twoFactor.startSetup()}
                      disabled={twoFactor.loadingAction !== null}
                      className="rounded-2xl bg-[#1d1d1f] px-5 py-3 font-bold text-white transition hover:bg-[#333336] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {twoFactor.loadingAction === "setup"
                        ? "Đang tạo QR..."
                        : "Tạo QR"}
                    </button>
                  </div>
                ) : (
                  <form onSubmit={twoFactor.confirmSetup} className="space-y-4">
                    <div>
                      <label className="block text-sm font-bold">
                        Mã 6 số từ Authenticator
                      </label>
                      <input
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        className="mt-2 w-full rounded-2xl border border-[#e5e5ea] px-4 py-3 text-center text-xl font-black tracking-[0.28em] outline-none focus:border-[#fa233b]"
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
                        className="rounded-2xl border border-[#e5e5ea] px-5 py-3 font-bold transition hover:border-[#fa233b] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Hủy
                      </button>

                      <button
                        type="submit"
                        disabled={twoFactor.loadingAction !== null}
                        className="rounded-2xl bg-[#1d1d1f] px-5 py-3 font-bold text-white transition hover:bg-[#333336] disabled:cursor-not-allowed disabled:opacity-60"
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
              {enabled ? (
                <>
                  <form
                    onSubmit={twoFactor.disable}
                    className="rounded-3xl border border-[#e5e5ea] bg-[#f5f5f7] p-5"
                  >
                    <h3 className="text-xl font-black">Tắt 2FA</h3>
                    <p className="mt-2 text-sm leading-6 text-[#6e6e73]">
                      Sau khi tắt 2FA, bạn sẽ được đăng xuất và cần đăng nhập
                      lại.
                    </p>

                    <div className="mt-5 space-y-4">
                      <input
                        type="password"
                        placeholder="Mật khẩu"
                        className="w-full rounded-2xl border border-[#e5e5ea] px-4 py-3 outline-none focus:border-[#fa233b]"
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
                        className="w-full rounded-2xl border border-[#e5e5ea] px-4 py-3 outline-none focus:border-[#fa233b]"
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
                      className="mt-5 w-full rounded-2xl bg-[#1d1d1f] px-5 py-3 font-bold text-white transition hover:bg-[#333336] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {twoFactor.loadingAction === "disable"
                        ? "Đang tắt..."
                        : "Tắt 2FA"}
                    </button>
                  </form>

                  <form
                    onSubmit={twoFactor.regenerateRecoveryCodes}
                    className="rounded-3xl border border-[#e5e5ea] bg-[#f5f5f7] p-5"
                  >
                    <h3 className="text-xl font-black">
                      Tạo lại recovery codes
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[#6e6e73]">
                      Codes mới sẽ thay thế toàn bộ recovery codes cũ.
                    </p>

                    <div className="mt-5 space-y-4">
                      <input
                        type="password"
                        placeholder="Mật khẩu"
                        className="w-full rounded-2xl border border-[#e5e5ea] px-4 py-3 outline-none focus:border-[#fa233b]"
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
                        className="w-full rounded-2xl border border-[#e5e5ea] px-4 py-3 outline-none focus:border-[#fa233b]"
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
                      className="mt-5 w-full rounded-2xl border border-[#e5e5ea] px-5 py-3 font-bold transition hover:border-[#fa233b] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {twoFactor.loadingAction === "regenerate"
                        ? "Đang tạo..."
                        : "Tạo lại recovery codes"}
                    </button>
                  </form>
                </>
              ) : null}
            </div>
          )}

          <RecoveryCodesBox codes={twoFactor.recoveryCodes} />
        </div>
      </div>
    </div>
  );
}

export function TwoFactorPanel({ user }: TwoFactorPanelProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const twoFactor = useTwoFactorSettings();
  const enabled = Boolean(user?.twoFactorEnabled);

  return (
    <>
      <div className="rounded-3xl bg-[#f5f5f7] px-5 py-4">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#fa233b]">
          2FA Status
        </p>
        <p className="mt-2 font-black">{enabled ? "Đã bật" : "Chưa bật"}</p>

        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="mt-4 rounded-2xl bg-[#1d1d1f] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#333336]"
        >
          {enabled ? "Quản lý 2FA" : "Bật 2FA"}
        </button>
      </div>

      {dialogOpen ? (
        <TwoFactorDialog
          enabled={enabled}
          onClose={() => setDialogOpen(false)}
          twoFactor={twoFactor}
        />
      ) : null}
    </>
  );
}

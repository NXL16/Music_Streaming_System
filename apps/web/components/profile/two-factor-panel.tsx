"use client";

import { useEffect, useState } from "react";
import { Download, KeyRound, ShieldCheck } from "lucide-react";
import type { UserProfile } from "@/lib/auth/auth.types";
import { useTwoFactorSettings } from "@/lib/auth/use-two-factor-settings";

type TwoFactorPanelProps = {
  user: UserProfile | null;
  open: boolean;
  onToggle: () => void;
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
  link.download = "mss-recovery-codes.txt";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
        color: { dark: "#1d1d1f", light: "#f5f5f7" },
      });
      if (!cancelled) setDataUrl(url);
    }
    void renderQrCode();
    return () => { cancelled = true; };
  }, [value]);

  if (!dataUrl) {
    return <div className="flex aspect-square w-full max-w-52 items-center justify-center bg-(--systemQuinary) text-(--systemSecondary) [font:var(--callout)]">Đang tạo QR…</div>;
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={dataUrl} alt="Mã QR xác thực hai lớp" className="aspect-square w-full max-w-52 bg-white p-3" />;
}

function SecurityInput({
  placeholder,
  value,
  onChange,
  type = "text",
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  type?: "password" | "text";
}) {
  return <input type={type} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} required className="w-full border-b border-(--labelDivider) bg-transparent px-1 py-3 text-(--systemPrimary) outline-none focus:border-(--keyColor)" />;
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  if (codes.length === 0) return null;
  return <section className="mt-6 max-w-xl border-t border-(--labelDivider) pt-5"><div className="flex items-start justify-between gap-4"><div><h3 className="text-(--systemPrimary) [font:var(--body-tall-emphasized)]">Mã khôi phục</h3><p className="mt-1 text-(--systemSecondary) [font:var(--callout)]">Mỗi mã chỉ được dùng một lần.</p></div><button type="button" onClick={() => downloadRecoveryCodes(codes)} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-(--labelDivider) px-3.5 py-2 text-(--systemPrimary) [font:var(--callout-emphasized)]"><Download className="h-4 w-4" />Tải xuống</button></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{codes.map((code) => <code key={code} className="bg-(--systemQuinary) px-3 py-2 text-(--systemPrimary) [font:var(--callout-emphasized)] tracking-[0.12em]">{code}</code>)}</div></section>;
}

export function TwoFactorPanel({ user, open, onToggle }: TwoFactorPanelProps) {
  const [activeTool, setActiveTool] = useState<"none" | "recovery" | "disable">("none");
  const twoFactor = useTwoFactorSettings();
  const enabled = Boolean(user?.twoFactorEnabled);
  const busy = twoFactor.loadingAction !== null;

  function toggleManager() {
    if (open) setActiveTool("none");
    onToggle();
  }

  return <section className="border-t border-(--labelDivider) py-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3"><ShieldCheck className={`mt-0.5 h-5 w-5 shrink-0 ${enabled ? "text-(--statusPositive)" : "text-(--systemSecondary)"}`} /><div><h2 className="text-(--systemPrimary) [font:var(--body-tall-emphasized)]">Xác thực hai lớp</h2><p className="mt-1 text-(--systemSecondary) [font:var(--callout)]">{enabled ? "Đang bật để bảo vệ tài khoản khi đăng nhập." : "Thêm một bước xác thực khi đăng nhập để bảo vệ tài khoản."}</p></div></div>
      {enabled ? <button type="button" onClick={toggleManager} className="shrink-0 rounded-full border border-(--labelDivider) px-4 py-2 text-(--systemPrimary) [font:var(--callout-emphasized)]">{open ? "Đóng" : "Quản lý 2FA"}</button> : !twoFactor.setupData ? <button type="button" onClick={() => void twoFactor.startSetup()} disabled={busy} className="shrink-0 rounded-full bg-(--keyColor) px-4 py-2 text-(--keyColorText) [font:var(--callout-emphasized)] disabled:opacity-60">{twoFactor.loadingAction === "setup" ? "Đang tạo QR…" : "Thiết lập 2FA"}</button> : null}
    </div>

    {(twoFactor.message || twoFactor.error) && <p className={`mt-4 [font:var(--callout)] ${twoFactor.error ? "text-(--keyColor)" : "text-(--statusPositive)"}`}>{twoFactor.error || twoFactor.message}</p>}

    {twoFactor.setupData && !enabled && <div className="mt-6 grid max-w-3xl gap-6 border-t border-(--labelDivider) pt-6 lg:grid-cols-[208px_minmax(0,1fr)]"><TwoFactorQrCode value={twoFactor.setupData.otpauthUrl} /><form onSubmit={twoFactor.confirmSetup} className="max-w-md"><h3 className="text-(--systemPrimary) [font:var(--body-tall-emphasized)]">Quét mã QR bằng ứng dụng xác thực</h3><p className="mt-1 text-(--systemSecondary) [font:var(--callout)]">Sau đó nhập mã gồm 6 chữ số để hoàn tất thiết lập.</p><label className="mt-5 block text-(--systemPrimary) [font:var(--callout-emphasized)]">Mã xác thực</label><input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={twoFactor.confirmCode} onChange={(event) => twoFactor.setConfirmCode(event.target.value)} required className="mt-2 w-full border-b border-(--labelDivider) bg-transparent px-1 py-3 text-center text-xl text-(--systemPrimary) outline-none [font:var(--large-title-semibold)] tracking-[0.28em] focus:border-(--keyColor)" /><div className="mt-5 flex gap-2"><button type="button" onClick={twoFactor.cancelSetup} disabled={busy} className="rounded-full px-4 py-2 text-(--systemSecondary) [font:var(--callout-emphasized)]">Hủy</button><button type="submit" disabled={busy} className="rounded-full bg-(--keyColor) px-4 py-2 text-(--keyColorText) [font:var(--callout-emphasized)]">{twoFactor.loadingAction === "confirm" ? "Đang xác nhận…" : "Bật 2FA"}</button></div></form></div>}

    {enabled && open && <div className="mt-6 max-w-3xl border-t border-(--labelDivider) pt-5">{activeTool === "none" ? <div className="grid gap-5 sm:grid-cols-2"><button type="button" onClick={() => setActiveTool("recovery")} className="text-left"><div className="flex items-center gap-2 text-(--systemPrimary) [font:var(--body-tall-emphasized)]"><KeyRound className="h-4 w-4 text-(--systemSecondary)" />Mã khôi phục</div><p className="mt-1 text-(--systemSecondary) [font:var(--callout)]">Tạo mã mới hoặc tải lại mã vừa tạo.</p><span className="mt-3 inline-block text-(--keyColor) [font:var(--callout-emphasized)]">Quản lý mã →</span></button><button type="button" onClick={() => setActiveTool("disable")} className="border-t border-(--labelDivider) pt-5 text-left sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0"><p className="text-(--systemPrimary) [font:var(--body-tall-emphasized)]">Tắt xác thực hai lớp</p><p className="mt-1 text-(--systemSecondary) [font:var(--callout)]">Tắt 2FA sẽ đăng xuất tài khoản khỏi thiết bị này.</p><span className="mt-3 inline-block text-(--keyColor) [font:var(--callout-emphasized)]">Tiếp tục →</span></button></div> : activeTool === "recovery" ? <form onSubmit={twoFactor.regenerateRecoveryCodes} className="max-w-xl"><button type="button" onClick={() => setActiveTool("none")} className="text-(--systemSecondary) [font:var(--callout-emphasized)]">← Quay lại</button><h3 className="mt-4 text-(--systemPrimary) [font:var(--body-tall-emphasized)]">Tạo lại mã khôi phục</h3><p className="mt-1 text-(--systemSecondary) [font:var(--callout)]">Mã mới sẽ thay thế toàn bộ mã khôi phục cũ.</p><div className="mt-5 space-y-3"><SecurityInput type="password" placeholder="Mật khẩu" value={twoFactor.regenerateForm.password} onChange={(value) => twoFactor.updateRegenerateField("password", value)} /><SecurityInput placeholder="Mã 2FA hoặc mã khôi phục" value={twoFactor.regenerateForm.verificationInput} onChange={(value) => twoFactor.updateRegenerateField("verificationInput", value)} /></div><button type="submit" disabled={busy} className="mt-5 rounded-full bg-(--keyColor) px-4 py-2 text-(--keyColorText) [font:var(--callout-emphasized)]">{twoFactor.loadingAction === "regenerate" ? "Đang tạo…" : "Tạo lại mã"}</button></form> : <form onSubmit={twoFactor.disable} className="max-w-xl"><button type="button" onClick={() => setActiveTool("none")} className="text-(--systemSecondary) [font:var(--callout-emphasized)]">← Quay lại</button><h3 className="mt-4 text-(--systemPrimary) [font:var(--body-tall-emphasized)]">Tắt xác thực hai lớp</h3><p className="mt-1 text-(--systemSecondary) [font:var(--callout)]">Sau khi tắt, bạn sẽ được đăng xuất và cần đăng nhập lại.</p><div className="mt-5 space-y-3"><SecurityInput type="password" placeholder="Mật khẩu" value={twoFactor.disableForm.password} onChange={(value) => twoFactor.updateDisableField("password", value)} /><SecurityInput placeholder="Mã 2FA hoặc mã khôi phục" value={twoFactor.disableForm.verificationInput} onChange={(value) => twoFactor.updateDisableField("verificationInput", value)} /></div><button type="submit" disabled={busy} className="mt-5 rounded-full bg-(--keyColor) px-4 py-2 text-(--keyColorText) [font:var(--callout-emphasized)]">{twoFactor.loadingAction === "disable" ? "Đang tắt…" : "Tắt 2FA"}</button></form>}<RecoveryCodes codes={twoFactor.recoveryCodes} /></div>}
  </section>;
}

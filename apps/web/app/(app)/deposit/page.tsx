"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ArrowRight, Check, Coins, Landmark, RefreshCw, Smartphone } from "lucide-react";
import { MusicPageHeading, MusicPageLayout } from "@/components/layout/music-page-layout";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { useWalletBalance } from "@/lib/wallet/use-wallet-balance";
import { createDepositOrder } from "@/lib/wallet/wallet.api";
import { toast } from "sonner";

const PRESET_PACKAGES = [
  { coins: 10, price: 10_000 }, { coins: 20, price: 20_000 },
  { coins: 50, price: 50_000 }, { coins: 100, price: 100_000 },
  { coins: 200, price: 200_000 }, { coins: 500, price: 500_000 },
];

type NFBankPayment = { deepLink: string; expectedCoinBalance: number | null; orderId: string };

function getNFBankDeepLink(payUrl: string) {
  const token = new URL(payUrl).searchParams.get("token");
  if (!token) throw new Error("NFBank không trả về token thanh toán hợp lệ.");
  return `nfbank://payment?token=${encodeURIComponent(token)}`;
}

function NFBankQrCode({ value }: { value: string }) {
  const [dataUrl, setDataUrl] = useState("");
  useEffect(() => {
    let cancelled = false;
    void import("qrcode").then((QRCode) => QRCode.toDataURL(value, { errorCorrectionLevel: "M", margin: 2, scale: 8, color: { dark: "#1d1d1f", light: "#f5f5f7" } })).then((url) => { if (!cancelled) setDataUrl(url); });
    return () => { cancelled = true; };
  }, [value]);
  if (!dataUrl) return <div className="mx-auto flex h-56 w-56 items-center justify-center bg-(--systemQuinary) text-(--systemSecondary) [font:var(--callout)]">Đang tạo mã QR…</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={dataUrl} alt="Mã QR thanh toán NFBank" className="mx-auto aspect-square w-56 bg-white p-2" />;
}

export default function DepositPage() {
  const { balance, loading, error: balanceError, refreshBalance } = useWalletBalance();
  const [selectedPreset, setSelectedPreset] = useState<number | "custom">(50);
  const [customCoins, setCustomCoins] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"MOMO" | "NFBANK">("MOMO");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [nfBankPayment, setNfBankPayment] = useState<NFBankPayment | null>(null);
  const coinAmount = selectedPreset === "custom" ? Number.parseInt(customCoins) || 0 : (PRESET_PACKAGES.find((item) => item.coins === selectedPreset)?.coins ?? 0);
  const priceVnd = coinAmount * 1000;

  useEffect(() => {
    if (!nfBankPayment) return;
    if (nfBankPayment.expectedCoinBalance !== null && balance?.coinBalance !== undefined && balance.coinBalance >= nfBankPayment.expectedCoinBalance) {
      const timeout = window.setTimeout(() => { setNfBankPayment(null); toast.success("Nạp Coin thành công", { description: "Số dư ví của bạn đã được cập nhật." }); }, 0);
      return () => window.clearTimeout(timeout);
    }
    const interval = window.setInterval(() => refreshBalance(), 2_000);
    return () => window.clearInterval(interval);
  }, [balance?.coinBalance, nfBankPayment, refreshBalance]);

  async function pay() {
    setSubmitError("");
    if (coinAmount < 10 || priceVnd > 10_000_000) { setSubmitError("Số tiền nạp phải từ 10.000đ đến 10.000.000đ."); return; }
    setSubmitting(true);
    try {
      const order = await createDepositOrder({ amountVnd: priceVnd, paymentMethod });
      if (!order.paymentUrl) throw new Error("Không nhận được liên kết thanh toán từ máy chủ.");
      if (paymentMethod === "NFBANK") {
        const deepLink = getNFBankDeepLink(order.paymentUrl);
        if (/iPhone|iPod|Android.*Mobile/i.test(navigator.userAgent)) { window.location.assign(deepLink); return; }
        setNfBankPayment({ deepLink, orderId: order.orderId, expectedCoinBalance: balance === null ? null : balance.coinBalance + coinAmount });
        setSubmitting(false);
        return;
      }
      window.location.assign(order.paymentUrl);
    } catch (error) { setSubmitError(getApiErrorMessage(error, "Không thể tạo hóa đơn nạp.")); setSubmitting(false); }
  }

  return <MusicPageLayout>
    {nfBankPayment && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><div role="dialog" aria-modal="true" aria-labelledby="nfbank-payment-title" className="w-full max-w-sm rounded-3xl bg-(--background) p-6 text-center shadow-2xl"><h2 id="nfbank-payment-title" className="text-(--systemPrimary) [font:var(--title-2-emphasized)]">Thanh toán qua NFBank</h2><p className="mt-2 text-(--systemSecondary) [font:var(--callout)]">Quét mã QR bằng ứng dụng NFBank để xác nhận đơn {nfBankPayment.orderId}.</p><div className="my-5"><NFBankQrCode value={nfBankPayment.deepLink} /></div><a href={nfBankPayment.deepLink} className="inline-flex rounded-full bg-(--keyColor) px-5 py-2.5 text-(--keyColorText) [font:var(--callout-emphasized)]">Mở ứng dụng NFBank</a><button type="button" onClick={() => setNfBankPayment(null)} className="mt-4 block w-full text-(--systemSecondary) [font:var(--callout-emphasized)]">Đóng</button></div></div>}
    <MusicPageHeading title="Top Up Coin" trailing={<button type="button" onClick={() => refreshBalance()} className="inline-flex items-center gap-2 rounded-full border border-(--labelDivider) px-3.5 py-2 text-(--systemPrimary) [font:var(--callout-emphasized)]"><RefreshCw className="h-4 w-4" />Refresh</button>} />
    <main className="grid max-w-[1240px] gap-10 px-(--bodyGutter) pb-12 pt-3 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
      <div className="min-w-0"><div><h2 className="text-(--systemPrimary) [font:var(--title-2-emphasized)]">Chọn gói Coin</h2><p className="mt-1 text-(--systemSecondary) [font:var(--callout)]">1.000 VND tương ứng với 1 Coin.</p></div><div className="mt-5 grid grid-cols-2 divide-x divide-y divide-(--labelDivider) border-y border-(--labelDivider) sm:grid-cols-3">{PRESET_PACKAGES.map((item) => { const active = selectedPreset === item.coins; return <button key={item.coins} type="button" onClick={() => { setSelectedPreset(item.coins); setSubmitError(""); }} className={`relative px-4 py-5 text-left transition ${active ? "text-(--keyColor)" : "text-(--systemPrimary) hover:bg-(--systemQuinary)"}`}><strong className="block [font:var(--title-2-emphasized)]">{item.coins} <span className="[font:var(--body-tall-emphasized)]">Coin</span></strong><span className="mt-1 block text-(--systemSecondary) [font:var(--callout)]">{item.price.toLocaleString("vi-VN")}đ</span>{active && <Check className="absolute right-4 top-5 h-4 w-4" />}</button>; })}</div><button type="button" onClick={() => setSelectedPreset("custom")} className={`mt-1 flex w-full items-center justify-between border-b border-(--labelDivider) px-4 py-4 text-left transition ${selectedPreset === "custom" ? "text-(--keyColor)" : "text-(--systemPrimary) hover:bg-(--systemQuinary)"}`}><span className="[font:var(--body-tall-emphasized)]">Số Coin khác</span><span className="text-(--systemSecondary) [font:var(--callout)]">Tối thiểu 10 Coin</span></button>{selectedPreset === "custom" && <div className="mt-3 max-w-sm"><label className="text-(--systemSecondary) [font:var(--callout-emphasized)]">Số Coin muốn nạp</label><div className="mt-2 flex items-center border-b border-(--labelDivider) py-2"><input type="number" min="10" value={customCoins} onChange={(event) => { setCustomCoins(event.target.value); setSubmitError(""); }} autoFocus placeholder="Nhập số Coin" className="w-full bg-transparent text-(--systemPrimary) outline-none [font:var(--body-tall)]" /><span className="text-(--systemSecondary) [font:var(--callout)]">Coin</span></div></div>}
      <section className="mt-10"><h2 className="text-(--systemPrimary) [font:var(--title-2-emphasized)]">Phương thức thanh toán</h2><div className="mt-4 divide-y divide-(--labelDivider) border-y border-(--labelDivider)">{(["MOMO", "NFBANK"] as const).map((method) => { const active = paymentMethod === method; const Icon = method === "MOMO" ? Smartphone : Landmark; return <button key={method} type="button" onClick={() => setPaymentMethod(method)} className={`relative flex w-full items-center gap-3 px-4 py-4 text-left transition ${active ? "text-(--keyColor)" : "text-(--systemPrimary) hover:bg-(--systemQuinary)"}`}><Icon className="h-5 w-5" /><span><strong className="block [font:var(--body-tall-emphasized)]">{method === "MOMO" ? "MoMo" : "NFBank"}</strong><small className="text-(--systemSecondary) [font:var(--callout)]">{method === "MOMO" ? "Thanh toán qua ví MoMo" : "Quét mã QR bằng NFBank"}</small></span>{active && <Check className="ml-auto h-4 w-4" />}</button>; })}</div></section></div>
      <aside className="border-l border-(--labelDivider) pl-7 lg:sticky lg:top-6"><p className="text-(--systemSecondary) [font:var(--subhead-emphasized)]">ĐƠN NẠP COIN</p><div className="mt-5 flex items-center gap-3"><Coins className="h-5 w-5 text-(--keyColor)" /><div><p className="text-(--systemSecondary) [font:var(--callout)]">Số dư hiện tại</p><p className="text-(--systemPrimary) [font:var(--body-tall-emphasized)]">{loading ? "—" : (balance?.coinBalance ?? 0).toLocaleString()} Coin</p></div></div><dl className="mt-7 space-y-3 border-t border-(--labelDivider) pt-5 [font:var(--callout)]"><div className="flex justify-between text-(--systemSecondary)"><dt>Gói nạp</dt><dd className="text-(--systemPrimary)">{coinAmount.toLocaleString()} Coin</dd></div><div className="flex justify-between text-(--systemSecondary)"><dt>Thanh toán</dt><dd className="text-(--systemPrimary)">{paymentMethod === "MOMO" ? "MoMo" : "NFBank"}</dd></div><div className="flex justify-between pt-3 text-(--systemPrimary) [font:var(--body-tall-emphasized)]"><dt>Tổng thanh toán</dt><dd>{priceVnd.toLocaleString("vi-VN")}đ</dd></div></dl>{(balanceError || submitError) && <p className="mt-5 flex gap-2 text-(--keyColor) [font:var(--callout)]"><AlertCircle className="h-4 w-4 shrink-0" />{balanceError || submitError}</p>}<button type="button" disabled={submitting || coinAmount < 10} onClick={() => void pay()} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-(--keyColor) px-5 py-3 text-(--keyColorText) [font:var(--callout-emphasized)] disabled:opacity-50">{submitting ? "Đang kết nối thanh toán…" : "Tiếp tục thanh toán"}<ArrowRight className="h-4 w-4" /></button></aside>
    </main>
  </MusicPageLayout>;
}

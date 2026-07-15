"use client";

import { useState } from "react";
import { PageHero } from "@/components/layout/page-hero";
import { useWalletBalance } from "@/lib/wallet/use-wallet-balance";
import { createDepositOrder } from "@/lib/wallet/wallet.api";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { Coins, ArrowRight, Check, AlertCircle } from "lucide-react";

const PRESET_PACKAGES = [
  { coins: 10, price: 10000 },
  { coins: 20, price: 20000 },
  { coins: 50, price: 50000 },
  { coins: 100, price: 100000 },
  { coins: 200, price: 200000 },
  { coins: 500, price: 500000 },
];

export default function DepositPage() {
  const { balance, loading: loadingBalance, error: balanceError, refreshBalance } = useWalletBalance();

  const [selectedPreset, setSelectedPreset] = useState<number | "custom">(50);
  const [customCoins, setCustomCoins] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"MOMO" | "NFBANK">("MOMO");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Calculate coins & prices
  let coinAmount = 0;
  let priceVnd = 0;

  if (selectedPreset === "custom") {
    const coinsParsed = parseInt(customCoins) || 0;
    coinAmount = coinsParsed;
    priceVnd = coinsParsed * 1000;
  } else {
    const pkg = PRESET_PACKAGES.find((p) => p.coins === selectedPreset);
    if (pkg) {
      coinAmount = pkg.coins;
      priceVnd = pkg.price;
    }
  }

  // Handle submit deposit
  async function handleProceedPayment() {
    setSubmitError("");

    if (coinAmount <= 0) {
      setSubmitError("Vui lòng chọn hoặc nhập số Coin muốn nạp.");
      return;
    }

    if (priceVnd < 10000) {
      setSubmitError("Số tiền nạp tối thiểu là 10.000đ (tương đương 10 Coin).");
      return;
    }

    if (priceVnd > 10000000) {
      setSubmitError("Số tiền nạp tối đa một lần là 10.000.000đ.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await createDepositOrder({
        amountVnd: priceVnd,
        paymentMethod: paymentMethod,
      });

      if (response && response.paymentUrl) {
        // Redirect to third-party payment URL
        window.location.assign(response.paymentUrl);
      } else {
        throw new Error("Không nhận được liên kết thanh toán từ máy chủ.");
      }
    } catch (err: unknown) {
      const msg = getApiErrorMessage(
        err,
        "Đã xảy ra lỗi khi tạo hóa đơn nạp.",
      );
      setSubmitError(msg);
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHero
        eyebrow="Ví nhạc của bạn"
        title="Nạp Coin Hệ Thống"
        description="Quy đổi tiền tệ VND sang Coin để mua bài hát yêu thích, đăng ký gói hội viên VIP hoặc ủng hộ trực tiếp các nghệ sĩ tài năng."
      />

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px] text-(--systemPrimary)">
        {/* LEFT COLUMN: PACKAGES & METHODS */}
        <div className="space-y-8">

          {/* BALANCE CARD SNAPSHOT */}
          <div className="relative overflow-hidden rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40 p-6 backdrop-blur-md shadow-sm">
            <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-(--keyColor)/10 blur-3xl"></div>
            <div className="absolute -left-10 -bottom-10 h-36 w-36 rounded-full bg-amber-500/5 blur-3xl"></div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-inner">
                  <Coins className="h-7 w-7" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-neutral-500 dark:text-neutral-400">Số dư hiện tại</p>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-3xl font-black text-(--systemPrimary)">
                      {loadingBalance ? (
                        <span className="inline-block h-6 w-16 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800"></span>
                      ) : (
                        balance?.coinBalance.toLocaleString() ?? 0
                      )}
                    </span>
                    <span className="text-sm font-semibold text-amber-400">Coin</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => refreshBalance()}
                className="self-start sm:self-center rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 px-4 py-2 text-xs font-bold text-neutral-700 dark:text-neutral-200 transition-all border border-neutral-200 dark:border-neutral-700 shadow-sm"
              >
                Cập nhật số dư
              </button>
            </div>

            {balanceError && (
              <p className="mt-3 text-xs text-rose-500 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" /> {balanceError}
              </p>
            )}
          </div>

          {/* CHOOSE PACKAGE SECTION */}
          <section className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/10 p-6 md:p-8 space-y-6 shadow-sm">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-(--keyColor)">Bước 1</p>
              <h2 className="mt-1 text-2xl font-black text-(--systemPrimary)">Chọn số lượng Coin muốn nạp</h2>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Tỷ lệ quy đổi: 1.000 VND = 1 Coin</p>
            </div>

            {/* PRESETS GRID */}
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {PRESET_PACKAGES.map((pkg) => {
                const isSelected = selectedPreset === pkg.coins;
                return (
                  <button
                    key={pkg.coins}
                    onClick={() => {
                      setSelectedPreset(pkg.coins);
                      setSubmitError("");
                    }}
                    className={`relative flex flex-col items-center justify-center p-6 rounded-2xl border text-center transition-all ${
                      isSelected
                        ? "border-(--keyColor) bg-(--keyColor)/10 shadow-[0_0_20px_rgba(241,44,67,0.1)] ring-1 ring-(--keyColor)/30"
                        : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/40 hover:bg-neutral-50 dark:hover:bg-neutral-900/70 hover:border-neutral-300 dark:hover:border-neutral-700 shadow-sm"
                    }`}
                  >
                    <span className="text-2xl font-black text-(--systemPrimary)">{pkg.coins} Coin</span>
                    <span className="mt-2 text-sm font-semibold text-(--keyColor)">
                      {pkg.price.toLocaleString("vi-VN")} VND
                    </span>
                    {isSelected && (
                      <div className="absolute top-3 right-3 h-5 w-5 rounded-full bg-(--keyColor) flex items-center justify-center text-white text-[10px] font-bold">
                        <Check className="h-3 w-3" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* CUSTOM AMOUNT SELECTOR */}
            <div className={`p-5 rounded-2xl border transition-all ${
              selectedPreset === "custom"
                ? "border-(--keyColor) bg-(--keyColor)/10 shadow-[0_0_20px_rgba(241,44,67,0.1)] ring-1 ring-(--keyColor)/30"
                : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/40 hover:bg-neutral-50 dark:hover:bg-neutral-900/70 hover:border-neutral-300 dark:hover:border-neutral-700 shadow-sm"
            }`}>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="package_selection"
                  checked={selectedPreset === "custom"}
                  onChange={() => {
                    setSelectedPreset("custom");
                    setSubmitError("");
                  }}
                  className="accent-(--keyColor) h-4 w-4"
                />
                <span className="text-sm font-bold text-(--systemPrimary)">Nạp số lượng Coin khác</span>
              </label>

              {selectedPreset === "custom" && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2 animate-fadeIn">
                  <div>
                    <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 mb-1.5 uppercase">
                      Số lượng Coin muốn nạp
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        placeholder="Ví dụ: 150"
                        value={customCoins}
                        onChange={(e) => {
                          setCustomCoins(e.target.value);
                          setSubmitError("");
                        }}
                        min="10"
                        className="w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-(--systemPrimary) text-base font-bold placeholder-neutral-400 dark:placeholder-neutral-600 focus:outline-none focus:border-(--keyColor) focus:ring-1 focus:ring-(--keyColor)"
                      />
                      <span className="absolute right-4 top-3 text-sm text-neutral-400 dark:text-neutral-500 font-bold">Coin</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 mb-1.5 uppercase">
                      Số tiền thanh toán dự tính
                    </label>
                    <div className="w-full bg-neutral-100/50 dark:bg-neutral-950/50 border border-neutral-200 dark:border-neutral-800/80 rounded-xl px-4 py-3 text-(--keyColor) text-base font-bold flex items-center justify-between">
                      <span>{((parseInt(customCoins) || 0) * 1000).toLocaleString("vi-VN")}</span>
                      <span className="text-xs text-neutral-400 dark:text-neutral-500">VND</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* CHOOSE METHOD SECTION */}
          <section className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/10 p-6 md:p-8 space-y-6 shadow-sm">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-(--keyColor)">Bước 2</p>
              <h2 className="mt-1 text-2xl font-black text-(--systemPrimary)">Chọn cổng thanh toán</h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* MOMO CARD */}
              <button
                type="button"
                onClick={() => setPaymentMethod("MOMO")}
                className={`relative flex items-center gap-4 p-5 rounded-2xl border text-left transition-all ${
                  paymentMethod === "MOMO"
                    ? "border-(--keyColor) bg-(--keyColor)/10 shadow-[0_0_20px_rgba(241,44,67,0.05)] ring-1 ring-(--keyColor)/20"
                    : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/40 hover:bg-neutral-50 dark:hover:bg-neutral-900/70 hover:border-neutral-300 dark:hover:border-neutral-700 shadow-sm"
                }`}
              >
                <div className="h-12 w-12 rounded-xl bg-[#a50064] flex items-center justify-center text-white text-xs font-black shadow-md border border-[#a50064]/20 shrink-0">
                  MoMo
                </div>
                <div>
                  <span className="block text-sm font-bold text-(--systemPrimary)">Ví MoMo</span>
                  <span className="block text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Xác thực nhanh qua mã QR</span>
                </div>
                {paymentMethod === "MOMO" && (
                  <div className="absolute top-3 right-3 h-5 w-5 rounded-full bg-(--keyColor) flex items-center justify-center text-white">
                    <Check className="h-3 w-3" />
                  </div>
                )}
              </button>

              {/* NFBANK CARD */}
              <button
                type="button"
                onClick={() => setPaymentMethod("NFBANK")}
                className={`relative flex items-center gap-4 p-5 rounded-2xl border text-left transition-all ${
                  paymentMethod === "NFBANK"
                    ? "border-blue-600 bg-blue-50 dark:bg-blue-950/10 shadow-[0_0_20px_rgba(37,99,235,0.05)] ring-1 ring-blue-500/20"
                    : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/40 hover:bg-neutral-50 dark:hover:bg-neutral-900/70 hover:border-neutral-300 dark:hover:border-neutral-700 shadow-sm"
                }`}
              >
                <div className="h-12 w-12 rounded-xl bg-[#004e92] flex items-center justify-center text-white text-xs font-black shadow-md border border-[#004e92]/20 shrink-0">
                  BANK
                </div>
                <div>
                  <span className="block text-sm font-bold text-(--systemPrimary)">Ngân hàng (NFBank)</span>
                  <span className="block text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Cổng thanh toán ngân hàng</span>
                </div>
                {paymentMethod === "NFBANK" && (
                  <div className="absolute top-3 right-3 h-5 w-5 rounded-full bg-blue-600 flex items-center justify-center text-white">
                    <Check className="h-3 w-3" />
                  </div>
                )}
              </button>
            </div>
          </section>

        </div>

        {/* RIGHT COLUMN: ORDER SUMMARY */}
        <aside className="h-fit rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40 p-6 md:p-8 space-y-6 backdrop-blur-md shadow-sm dark:shadow-none">
          <div>
            <h2 className="text-xl font-bold text-(--systemPrimary)">Tóm tắt đơn nạp</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Vui lòng rà soát kỹ thông tin trước khi chuyển khoản</p>
          </div>

          <div className="space-y-4 border-y border-neutral-200 dark:border-neutral-800 py-4 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-500 dark:text-neutral-400">Số lượng Coin mua:</span>
              <span className="font-bold text-(--systemPrimary)">{coinAmount.toLocaleString()} Coin</span>
            </div>

            <div className="flex justify-between">
              <span className="text-neutral-500 dark:text-neutral-400">Tỷ giá quy đổi:</span>
              <span className="text-neutral-700 dark:text-neutral-300">1.000đ = 1 Coin</span>
            </div>

            <div className="flex justify-between">
              <span className="text-neutral-500 dark:text-neutral-400">Cổng thanh toán:</span>
              <span className={`font-bold ${paymentMethod === "MOMO" ? "text-(--keyColor)" : "text-blue-400"}`}>
                {paymentMethod === "MOMO" ? "Ví MoMo" : "Ngân hàng (NFBank)"}
              </span>
            </div>

            <div className="flex justify-between pt-2 border-t border-neutral-200 dark:border-neutral-800/50 text-base">
              <span className="font-semibold text-(--systemPrimary)">Tổng tiền trả:</span>
              <span className="font-black text-(--keyColor) text-lg">
                {priceVnd.toLocaleString("vi-VN")} VND
              </span>
            </div>
          </div>

          {submitError && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          <button
            onClick={() => void handleProceedPayment()}
            disabled={submitting}
            className="w-full bg-(--keyColor) hover:opacity-90 disabled:bg-neutral-200 dark:disabled:bg-neutral-800 disabled:text-neutral-400 dark:disabled:text-neutral-600 disabled:border-transparent text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-[0_4px_20px_rgba(241,44,67,0.2)] flex items-center justify-center gap-2 text-sm select-none cursor-pointer"
          >
            {submitting ? (
              <>
                Đang kết nối cổng thanh toán...
              </>
            ) : (
              <>
                Tiến hành thanh toán
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </aside>
      </div>
    </>
  );
}

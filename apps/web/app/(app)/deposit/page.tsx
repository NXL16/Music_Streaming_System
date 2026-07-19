"use client";

import { useState } from "react";
import { AlertCircle, ArrowRight, Check, Coins } from "lucide-react";
import {
  MusicPageHeading,
  MusicPageLayout,
  MusicPageSection,
} from "@/components/layout/music-page-layout";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { useWalletBalance } from "@/lib/wallet/use-wallet-balance";
import { createDepositOrder } from "@/lib/wallet/wallet.api";

const PRESET_PACKAGES = [
  { coins: 10, price: 10_000 },
  { coins: 20, price: 20_000 },
  { coins: 50, price: 50_000 },
  { coins: 100, price: 100_000 },
  { coins: 200, price: 200_000 },
  { coins: 500, price: 500_000 },
];

export default function DepositPage() {
  const {
    balance,
    loading,
    error: balanceError,
    refreshBalance,
  } = useWalletBalance();
  const [selectedPreset, setSelectedPreset] = useState<number | "custom">(50);
  const [customCoins, setCustomCoins] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"MOMO" | "NFBANK">("MOMO");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const coinAmount =
    selectedPreset === "custom"
      ? Number.parseInt(customCoins) || 0
      : (PRESET_PACKAGES.find((item) => item.coins === selectedPreset)?.coins ??
        0);
  const priceVnd = coinAmount * 1000;

  async function pay() {
    setSubmitError("");
    if (coinAmount < 10 || priceVnd > 10_000_000) {
      setSubmitError("Số tiền nạp phải từ 10.000đ đến 10.000.000đ.");
      return;
    }
    setSubmitting(true);
    try {
      const order = await createDepositOrder({
        amountVnd: priceVnd,
        paymentMethod,
      });
      if (!order.paymentUrl)
        throw new Error("Không nhận được liên kết thanh toán từ máy chủ.");
      window.location.assign(order.paymentUrl);
    } catch (error) {
      setSubmitError(getApiErrorMessage(error, "Không thể tạo hóa đơn nạp."));
      setSubmitting(false);
    }
  }

  return (
    <MusicPageLayout>
      <MusicPageHeading
        title="Top Up"
        trailing={
          <button
            type="button"
            onClick={() => refreshBalance()}
            className="rounded-full border border-(--labelDivider) px-4 py-2 text-(--systemPrimary) [font:var(--callout-emphasized)] transition hover:bg-(--navSidebarSelectedState)"
          >
            Refresh balance
          </button>
        }
      />
      <MusicPageSection title="Coin balance">
        <div className="group items-center text-(--systemPrimary) grid grid-cols-[auto_1fr_auto] pb-[7.5px] pt-[7.5px] relative w-full after:[border-top:var(--keyline-border-style)] after:content-[''] after:inset-e-0 after:inset-s-0 after:absolute after:top-0">
          <div className="me-3 flex h-10 w-10 items-center justify-center rounded-[5px] bg-(--keyColor) text-(--keyColorText)">
            <Coins className="h-5 w-5" />
          </div>
          <div>
            <p className="[font:var(--body-tall-emphasized)]">
              {loading ? "—" : (balance?.coinBalance ?? 0).toLocaleString()}{" "}
              Coin
            </p>
            <p className="text-(--systemSecondary) [font:var(--callout)]">
              Available in your wallet
            </p>
          </div>
        </div>
        {balanceError && (
          <p className="mt-3 flex items-center gap-2 text-(--keyColor) [font:var(--callout)]">
            <AlertCircle className="h-4 w-4" />
            {balanceError}
          </p>
        )}
      </MusicPageSection>
      <MusicPageSection title="Choose an amount">
        <p className="mb-4 text-(--systemSecondary) [font:var(--callout)]">
          1,000 VND = 1 Coin
        </p>
        <div className="grid grid-cols-2 gap-x-5 sm:grid-cols-3">
          {PRESET_PACKAGES.map((item) => {
            const active = selectedPreset === item.coins;
            return (
              <button
                key={item.coins}
                type="button"
                onClick={() => {
                  setSelectedPreset(item.coins);
                  setSubmitError("");
                }}
                className={`relative border-t py-5 text-left transition ${active ? "border-(--keyColor) text-(--keyColor)" : "border-(--labelDivider) text-(--systemPrimary) hover:opacity-65"}`}
              >
                <strong className="block [font:var(--body-tall-emphasized)]">
                  {item.coins} Coin
                </strong>
                <span className="mt-1 block text-(--systemSecondary) [font:var(--callout)]">
                  {item.price.toLocaleString("vi-VN")} VND
                </span>
                {active && <Check className="absolute inset-e-0 top-5 h-4 w-4" />}
              </button>
            );
          })}
        </div>
        <div
          className={`mt-4 border-t pt-4 ${selectedPreset === "custom" ? "border-(--keyColor)" : "border-(--labelDivider)"}`}
        >
          <button
            type="button"
            onClick={() => setSelectedPreset("custom")}
            className="text-(--systemPrimary) [font:var(--body-tall-emphasized)]"
          >
            Custom amount
          </button>
          {selectedPreset === "custom" && (
            <div className="mt-3 flex max-w-sm items-center border-b border-(--labelDivider) pb-2">
              <input
                type="number"
                min="10"
                value={customCoins}
                onChange={(event) => {
                  setCustomCoins(event.target.value);
                  setSubmitError("");
                }}
                placeholder="Coin amount"
                className="w-full bg-transparent text-(--systemPrimary) [font:var(--body-tall)] outline-none"
              />
              <span className="text-(--systemSecondary) [font:var(--callout)]">
                Coin
              </span>
            </div>
          )}
        </div>
      </MusicPageSection>
      <MusicPageSection title="Payment method">
        <div className="grid gap-x-5 sm:grid-cols-2">
          {(["MOMO", "NFBANK"] as const).map((method) => {
            const active = paymentMethod === method;
            return (
              <button
                key={method}
                type="button"
                onClick={() => setPaymentMethod(method)}
                className={`relative border-t py-5 text-left transition ${active ? "border-(--keyColor)" : "border-(--labelDivider) hover:opacity-65"}`}
              >
                <strong className="text-(--systemPrimary) [font:var(--body-tall-emphasized)]">
                  {method === "MOMO" ? "MoMo" : "Bank transfer"}
                </strong>
                <span className="mt-1 block text-(--systemSecondary) [font:var(--callout)]">
                  {method === "MOMO"
                    ? "Continue with MoMo payment"
                    : "Continue with NFBank"}
                </span>
                {active && (
                  <Check className="absolute inset-e-0 top-5 h-4 w-4 text-(--keyColor)" />
                )}
              </button>
            );
          })}
        </div>
      </MusicPageSection>
      <MusicPageSection title="Order summary">
        <div className="max-w-xl border-t border-(--labelDivider) py-4">
          <div className="flex justify-between py-2 text-(--systemSecondary) [font:var(--callout)]">
            <span>Coin</span>
            <span className="text-(--systemPrimary)">
              {coinAmount.toLocaleString()} Coin
            </span>
          </div>
          <div className="flex justify-between py-2 text-(--systemSecondary) [font:var(--callout)]">
            <span>Method</span>
            <span className="text-(--systemPrimary)">
              {paymentMethod === "MOMO" ? "MoMo" : "NFBank"}
            </span>
          </div>
          <div className="flex justify-between border-t border-(--labelDivider) pt-4 text-(--systemPrimary) [font:var(--body-tall-emphasized)]">
            <span>Total</span>
            <span>{priceVnd.toLocaleString("vi-VN")} VND</span>
          </div>
        </div>
        {submitError && (
          <p className="mb-4 flex items-center gap-2 text-(--keyColor) [font:var(--callout)]">
            <AlertCircle className="h-4 w-4" />
            {submitError}
          </p>
        )}
        <button
          type="button"
          disabled={submitting}
          onClick={() => void pay()}
          className="inline-flex items-center gap-2 rounded-full bg-(--keyColor) px-5 py-2.5 text-(--keyColorText) [font:var(--callout-emphasized)] disabled:opacity-50"
        >
          {submitting ? "Connecting payment…" : "Proceed to payment"}
          <ArrowRight className="h-4 w-4" />
        </button>
      </MusicPageSection>
    </MusicPageLayout>
  );
}

import type { CoinRate, PaymentOrder } from "./wallet.api";

export const PAYMENT_PRESETS = [
  10_000, 20_000, 50_000, 100_000, 200_000, 500_000,
];
export function validatePaymentAmount(value: string | number) {
  const amount = Number(value);
  return !Number.isSafeInteger(amount) ||
    amount < 10_000 ||
    amount > 10_000_000 ||
    amount % 1_000 !== 0
    ? "Enter 10,000–10,000,000 VND, in multiples of 1,000."
    : "";
}
export function quoteCoins(
  amount: number,
  rate: CoinRate | null,
  withdrawal = false,
) {
  if (
    !rate ||
    !Number.isSafeInteger(rate.amountVnd) ||
    !Number.isSafeInteger(rate.coinAmount) ||
    rate.amountVnd <= 0 ||
    rate.coinAmount <= 0 ||
    !Number.isSafeInteger(amount * rate.coinAmount)
  )
    return null;
  const coins = (amount * rate.coinAmount) / rate.amountVnd;
  return withdrawal ? Math.ceil(coins) : Math.floor(coins);
}
export const formatVnd = (value: number) =>
  new Intl.NumberFormat("vi-VN").format(value) + " VND";
export const formatCoins = (value: number) =>
  new Intl.NumberFormat("en-US").format(value) + " Coin";
export const isPaymentFinal = (order: PaymentOrder | null) =>
  order?.status === "SUCCESS" || order?.status === "FAILED";

export function paymentLinks(paymentUrl: string, nfbank = false) {
  const url = new URL(paymentUrl);
  const local =
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((!local && url.protocol !== "https:") || url.username || url.password)
    throw new Error("Invalid payment link.");
  if (!nfbank) return { paymentUrl: url.href, deepLink: null };
  const token = url.searchParams.get("token");
  if (!token || token.length > 8192)
    throw new Error("Invalid NFBank payment link.");
  return {
    paymentUrl: url.href,
    deepLink: "nfbank://payment?token=" + encodeURIComponent(token),
  };
}

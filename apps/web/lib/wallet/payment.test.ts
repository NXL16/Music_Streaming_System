import { expect, it } from "vitest";
import {
  paymentLinks,
  quoteCoins,
  validatePaymentAmount,
  isPaymentFinal,
} from "./payment";
import type { PaymentOrder } from "./wallet.api";

it("requires valid whole VND denominations and bounds", () => {
  for (const amount of ["", "abc", "Infinity", 9999, 10000001, 10001, 10000.5])
    expect(validatePaymentAmount(amount)).not.toBe("");
  expect(validatePaymentAmount(10000)).toBe("");
  expect(validatePaymentAmount(10000000)).toBe("");
});
it("uses the active rate and rounds withdrawals up", () => {
  const rate = { amountVnd: 3000, coinAmount: 2 };
  expect(quoteCoins(10000, rate)).toBe(6);
  expect(quoteCoins(10000, rate, true)).toBe(7);
  expect(quoteCoins(10000, null)).toBeNull();
  expect(quoteCoins(10000, { amountVnd: 0, coinAmount: 1 })).toBeNull();
});
it("rejects unsafe payment URLs and builds NFBank links from the token", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,x",
    "https://user:pass@example.com",
    "http://example.com",
  ])
    expect(() => paymentLinks(url)).toThrow();
  expect(() => paymentLinks("https://bank.example/pay", true)).toThrow();
  expect(
    paymentLinks("https://bank.example/pay?token=a%2Bb", true).deepLink,
  ).toBe("nfbank://payment?token=a%2Bb");
});
it("never treats pending or unknown states as success or failure", () => {
  for (const status of ["PENDING", "PROCESSING", "UNKNOWN"])
    expect(isPaymentFinal({ status } as PaymentOrder)).toBe(false);
  expect(isPaymentFinal(null)).toBe(false);
  expect(isPaymentFinal({ status: "SUCCESS" } as PaymentOrder)).toBe(true);
  expect(isPaymentFinal({ status: "FAILED" } as PaymentOrder)).toBe(true);
});

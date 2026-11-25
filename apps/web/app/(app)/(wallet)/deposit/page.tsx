"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useWallet } from "@/components/wallet/wallet-layout";
import { PaymentResult } from "@/components/wallet/payment-result";
import { WalletAmountField } from "@/components/wallet/wallet-amount-field";
import styles from "@/components/wallet/wallet.module.css";
import { useCoinRate } from "@/lib/wallet/use-coin-rate";
import { usePaymentOrder } from "@/lib/wallet/use-payment-order";
import { useWalletOperation } from "@/lib/wallet/use-wallet-operation";
import { createDepositOrder } from "@/lib/wallet/wallet.api";
import {
  PAYMENT_PRESETS,
  formatVnd,
  formatCoins,
  quoteCoins,
  validatePaymentAmount,
  paymentLinks,
  isPaymentFinal,
} from "@/lib/wallet/payment";

function PaymentQr({ value }: { value: string }) {
  const [image, setImage] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    import("qrcode")
      .then((qr) => qr.toDataURL(value, { margin: 2, scale: 6 }))
      .then((url) => {
        if (!cancelled) setImage(url);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);
  return image ? (
    <Image
      unoptimized
      src={image}
      width={200}
      height={200}
      alt="NFBank payment QR code"
      className={styles.qr}
    />
  ) : (
    <p role="status" className={styles.notice}>
      {error
        ? "The QR code is unavailable. Open the payment link instead."
        : "Preparing QR code..."}
    </p>
  );
}

export default function DepositPage() {
  const wallet = useWallet();
  const { rate, error: rateError, retry } = useCoinRate();
  const { operation, save, ready } = useWalletOperation("DEPOSIT");
  const status = usePaymentOrder("DEPOSIT", operation?.reference || null);
  const [amount, setAmount] = useState("50000");
  const [method, setMethod] = useState<"MOMO" | "NFBANK">("MOMO");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const coins = quoteCoins(Number(amount), rate);
  const completed = isPaymentFinal(status.order);
  const reference = operation?.reference;
  const refreshBalance = wallet.refreshBalance;
  useEffect(() => {
    if (completed) refreshBalance();
  }, [completed, reference, refreshBalance]);
  async function pay(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || !ready || operation) return;
    const validation = validatePaymentAmount(amount);
    if (validation || !rate || !coins) {
      setError(validation || "The exchange rate is unavailable. Please retry.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const order = await createDepositOrder({
        amountVnd: Number(amount),
        paymentMethod: method,
      });
      const links = paymentLinks(order.paymentUrl, method === "NFBANK");
      if (!order.orderId || !save({ reference: order.orderId, ...links }))
        throw new Error("Could not preserve payment details.");
      if (method === "MOMO") window.location.assign(links.paymentUrl);
    } catch {
      setError(
        "We couldn't open payment. Please check your connection and try again.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const links = (() => {
    try {
      return operation?.paymentUrl
        ? paymentLinks(operation.paymentUrl, Boolean(operation.deepLink))
        : null;
    } catch {
      return null;
    }
  })();
  return (
    <>
      {ready && operation && (
        <PaymentResult kind="DEPOSIT" {...status} onRefresh={status.refresh}>
          {!completed && links && (
            <>
              {links.deepLink && (
                <div className={styles.wide}>
                  <div className={styles.qrCard}>
                    <PaymentQr value={links.deepLink} />
                    <p className={styles.notice}>
                      Scan this QR code with your NFBank app to pay.
                    </p>
                  </div>
                </div>
              )}
              {links.deepLink && (
                <a className={styles.primary} href={links.deepLink}>
                  Open NFBank app
                </a>
              )}
              <a
                className={links.deepLink ? styles.button : styles.primary}
                href={links.paymentUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open payment page
              </a>
            </>
          )}
          <div className={styles.wide}>
            <button
              className={completed ? styles.primary : styles.textButton}
              type="button"
              onClick={() => {
                save(null);
                setError("");
              }}
            >
              {completed ? "Make another top-up" : "Start a new top-up"}
            </button>
          </div>
        </PaymentResult>
      )}
      {ready && !operation && (
        <form onSubmit={pay} noValidate className={styles.layout}>
          <div>
            <section className={styles.section}>
              <h2>Choose an amount</h2>
              <p className={styles.description}>Top up using MoMo or NFBank.</p>
              <WalletAmountField
                id="deposit-amount"
                presets={PAYMENT_PRESETS}
                amount={amount}
                rate={rate}
                disabled={busy}
                onChange={(value) => {
                  setAmount(value);
                  setError("");
                }}
              />
            </section>
            <section className={styles.section}>
              <h2>Payment method</h2>
              <div className={styles.methods}>
                {(["MOMO", "NFBANK"] as const).map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={styles.choice}
                    aria-pressed={method === value}
                    disabled={busy}
                    onClick={() => setMethod(value)}
                  >
                    <strong>{value === "MOMO" ? "MoMo" : "NFBank"}</strong>
                    <span>
                      {value === "MOMO"
                        ? "Pay with your MoMo wallet"
                        : "Scan a QR code in NFBank"}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>
          <aside className={styles.summary}>
            <h2>Review top-up</h2>
            <dl className={styles.receipt}>
              <div>
                <dt>You receive</dt>
                <dd>
                  {!rate ? (
                    <span
                      className={styles.loadingAmount}
                      aria-label="Loading Coins"
                    />
                  ) : coins !== null && coins > 0 ? (
                    formatCoins(coins)
                  ) : (
                    "--"
                  )}
                </dd>
              </div>
              <div>
                <dt>Payment method</dt>
                <dd>{method === "MOMO" ? "MoMo" : "NFBank"}</dd>
              </div>
              <div className={styles.total}>
                <dt>You pay</dt>
                <dd>
                  {Number.isSafeInteger(Number(amount))
                    ? formatVnd(Number(amount))
                    : "--"}
                </dd>
              </div>
            </dl>
            <p className={styles.notice}>
              Coins are credited after payment is confirmed. The final Coin
              amount is fixed when your order is created.
            </p>
            {(error || rateError) && (
              <p role="alert" className={styles.error}>
                {error || rateError}
              </p>
            )}
            {rateError && (
              <button
                type="button"
                className={styles.textButton}
                onClick={retry}
              >
                Retry exchange rate
              </button>
            )}
            <button
              type="submit"
              className={styles.primary + " " + styles.wide}
              disabled={busy || !rate || !ready}
            >
              {busy ? "Opening payment..." : "Continue to payment"}
            </button>
          </aside>
        </form>
      )}
    </>
  );
}

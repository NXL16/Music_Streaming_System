"use client";
import { Check, Clock3, CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { PaymentKind, PaymentOrder } from "@/lib/wallet/wallet.api";
import { formatCoins, formatVnd } from "@/lib/wallet/payment";
import styles from "./wallet.module.css";

export function PaymentResult({
  kind,
  order,
  error,
  checking,
  onRefresh,
  media,
  children,
}: {
  kind: PaymentKind;
  order: PaymentOrder | null;
  error?: string;
  checking: boolean;
  onRefresh: () => void;
  media?: ReactNode;
  children?: ReactNode;
}) {
  const success = order?.status === "SUCCESS",
    failed = order?.status === "FAILED";
  const Icon = success ? Check : failed ? CircleAlert : Clock3;
  const deposit = kind === "DEPOSIT";
  const title =
    error && !success && !failed
      ? deposit
        ? "Unable to confirm payment"
        : "Withdrawal status unavailable"
      : success
        ? deposit
          ? "Coins added"
          : "Withdrawal complete"
        : failed
          ? deposit
            ? "Payment not completed"
            : "Withdrawal not completed"
          : deposit
            ? order
              ? "Payment pending"
              : "Checking payment status"
            : order
              ? "Withdrawal pending"
              : "Checking withdrawal status";
  return (
    <section className={styles.result} aria-live="polite">
      <span
        className={styles.resultIcon}
        data-status={success ? "success" : failed ? "failed" : "pending"}
      >
        <Icon size={28} aria-hidden="true" />
      </span>
      <h2>{title}</h2>
      <p className={styles.description}>
        {success
          ? deposit
            ? "Your payment is confirmed and the Coins have been credited to your wallet."
            : "Your transfer is confirmed."
          : failed
            ? deposit
              ? "This payment was not completed. No Coins were added for this order."
              : "Your Coins have been returned."
            : error
              ? "Please try again."
              : "Waiting for confirmation."}
      </p>
      {order && (
        <dl className={styles.receipt}>
          <div>
            <dt>Reference</dt>
            <dd>{order.orderId}</dd>
          </div>
          <div>
            <dt>Amount</dt>
            <dd>{formatVnd(order.amountVnd)}</dd>
          </div>
          <div>
            <dt>Coins</dt>
            <dd>{formatCoins(order.coinAmount)}</dd>
          </div>
        </dl>
      )}
      {media}
      <div className={styles.actions}>
        {!success && !failed && (
          <button
            type="button"
            className={styles.button}
            onClick={onRefresh}
            disabled={checking}
            aria-busy={checking}
          >
            {checking ? "Checking..." : "Check status"}
          </button>
        )}
        {children}
      </div>
    </section>
  );
}

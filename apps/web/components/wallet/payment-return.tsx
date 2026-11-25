"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useWallet } from "./wallet-layout";
import { PaymentResult } from "./payment-result";
import styles from "./wallet.module.css";
import { usePaymentOrder } from "@/lib/wallet/use-payment-order";
import { useWalletOperation } from "@/lib/wallet/use-wallet-operation";
import { isPaymentFinal } from "@/lib/wallet/payment";

export function PaymentReturn() {
  const params = useSearchParams();
  const reference = params.get("orderId") || "";
  const valid = /^(MOMO|NFBANK)-[0-9a-f]{32}$/.test(reference);
  const wallet = useWallet();
  const { save } = useWalletOperation("DEPOSIT");
  const status = usePaymentOrder("DEPOSIT", valid ? reference : null);
  const completed = isPaymentFinal(status.order);
  const refresh = wallet.refreshBalance;
  useEffect(() => {
    if (completed) refresh();
  }, [completed, reference, refresh]);
  const backToWallet = (
    <Link
      className={styles.primary}
      href="/deposit"
      onClick={() => {
        save(null);
      }}
    >
      Back to wallet
    </Link>
  );
  return (
    <>
      {valid ? (
        <PaymentResult kind="DEPOSIT" {...status} onRefresh={status.refresh}>
          {backToWallet}
        </PaymentResult>
      ) : (
        <section className={styles.result}>
          <h2>Payment unavailable</h2>
          <p className={styles.description}>
            Open your wallet to check your payment.
          </p>
          <div className={styles.actions}>{backToWallet}</div>
        </section>
      )}
    </>
  );
}

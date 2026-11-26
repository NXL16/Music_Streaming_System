"use client";
import Link from "next/link";
import { createContext, useContext, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { MusicPageLayout } from "@/components/layout/music-page-layout";
import { formatCoins } from "@/lib/wallet/payment";
import { useWalletBalance } from "@/lib/wallet/use-wallet-balance";
import styles from "./wallet.module.css";

const WalletContext = createContext<ReturnType<typeof useWalletBalance> | null>(
  null,
);

export function useWallet() {
  const wallet = useContext(WalletContext);
  if (!wallet) throw new Error("Wallet layout is required");
  return wallet;
}

export function WalletLayout({ children }: { children: ReactNode }) {
  const wallet = useWalletBalance();
  const { balance, error } = wallet;
  const pathname = usePathname();
  const active =
    pathname === "/withdraw"
      ? "withdraw"
      : pathname === "/history"
        ? "history"
        : "deposit";
  return (
    <WalletContext.Provider value={wallet}>
      <MusicPageLayout>
        <div className={styles.page}>
          <header className={styles.header}>
            <div>
              <h1>Wallet</h1>
            </div>

            <div className={styles.balance}>
              <span>Available balance</span>
              <strong>
                {balance ? (
                  formatCoins(balance.coinBalance)
                ) : (
                  <span
                    className={styles.loadingAmount}
                    aria-label="Loading balance"
                  />
                )}
              </strong>
              {balance && balance.frozenBalance > 0 && (
                <small>{formatCoins(balance.frozenBalance)} on hold</small>
              )}
            </div>
          </header>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <nav className={styles.tabs} aria-label="Wallet actions">
            <Link
              href="/deposit"
              aria-current={active === "deposit" ? "page" : undefined}
            >
              Add Coins
            </Link>
            <Link
              href="/withdraw"
              aria-current={active === "withdraw" ? "page" : undefined}
            >
              Withdraw
            </Link>
            <Link
              href="/history"
              aria-current={active === "history" ? "page" : undefined}
            >
              History
            </Link>
          </nav>
          {children}
        </div>
      </MusicPageLayout>
    </WalletContext.Provider>
  );
}

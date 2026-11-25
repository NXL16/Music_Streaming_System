"use client";

import { AuthInput } from "@/components/auth/auth-form";
import {
  formatCoins,
  formatVnd,
  quoteCoins,
  validatePaymentAmount,
} from "@/lib/wallet/payment";
import type { CoinRate } from "@/lib/wallet/wallet.api";
import styles from "./wallet.module.css";

export function WalletAmountField({
  id,
  presets,
  amount,
  rate,
  withdrawal = false,
  disabled = false,
  onChange,
}: {
  id: string;
  presets: readonly number[];
  amount: string;
  rate: CoinRate | null;
  withdrawal?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const validation = amount ? validatePaymentAmount(amount) : "";

  return (
    <>
      <div className={styles.packages}>
        {presets.map((value) => {
          const coins = quoteCoins(value, rate, withdrawal);
          return (
            <button
              key={value}
              type="button"
              className={styles.choice}
              aria-pressed={Number(amount) === value}
              disabled={disabled}
              onClick={() => onChange(String(value))}
            >
              <strong aria-busy={!rate}>
                {coins !== null ? (
                  formatCoins(coins)
                ) : (
                  <span
                    className={styles.loadingAmount}
                    aria-label="Loading Coins"
                  />
                )}
              </strong>
              <span>{formatVnd(value)}</span>
            </button>
          );
        })}
      </div>
      <div className={styles.custom}>
        <AuthInput
          compact
          id={id}
          label="Custom amount (VND)"
          inputMode="numeric"
          value={amount}
          error={validation || undefined}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        {!validation && (
          <p className={styles.notice}>
            10,000 to 10,000,000 VND, in multiples of 1,000.
          </p>
        )}
      </div>
    </>
  );
}

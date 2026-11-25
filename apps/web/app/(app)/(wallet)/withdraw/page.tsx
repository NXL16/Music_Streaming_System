"use client";

import { useEffect } from "react";
import { Check } from "lucide-react";
import { AuthInput } from "@/components/auth/auth-form";
import { ContentDialog } from "@/components/catalog/content-dialog";
import { useWallet } from "@/components/wallet/wallet-layout";
import { PaymentResult } from "@/components/wallet/payment-result";
import { WalletAmountField } from "@/components/wallet/wallet-amount-field";
import styles from "@/components/wallet/wallet.module.css";
import { useCoinRate } from "@/lib/wallet/use-coin-rate";
import { useWithdrawal } from "@/lib/wallet/use-withdrawal";
import {
  formatCoins,
  formatVnd,
  quoteCoins,
  validatePaymentAmount,
  isPaymentFinal,
} from "@/lib/wallet/payment";

export default function WithdrawPage() {
  const wallet = useWallet();
  const rate = useCoinRate();
  const auth = useWithdrawal();
  const selected = auth.accounts.find(
    (account) => account.id === auth.selected,
  );
  const original = auth.pending.operation;
  const amount = original?.amountVnd ?? Number(auth.amount);
  const coins = quoteCoins(amount, rate.rate, true);
  const completed = isPaymentFinal(auth.status.order);
  const reference = original?.reference;
  const orderStatus = auth.status.order?.status;
  const refreshBalance = wallet.refreshBalance;
  useEffect(() => {
    if (completed || reference) refreshBalance();
  }, [completed, reference, orderStatus, refreshBalance]);
  const enough =
    wallet.balance !== null &&
    coins !== null &&
    coins > 0 &&
    coins <= wallet.balance.coinBalance;
  const blocked =
    !auth.isPinSet ||
    !selected ||
    !enough ||
    Boolean(validatePaymentAmount(auth.amount)) ||
    auth.loading ||
    !auth.pending.ready;
  const blockerHint = !auth.loading
    ? !auth.isPinSet
      ? "Set a withdrawal PIN to continue."
      : !selected
        ? "Link or select a bank account to continue."
        : coins !== null && wallet.balance && !enough
          ? "Insufficient available Coins for this amount."
          : ""
    : "";
  const dialogTitle =
    auth.dialog === "pin"
      ? "Set withdrawal PIN"
      : auth.dialog === "bank"
        ? "Link a bank account"
        : "Confirm withdrawal";
  const dialogDescription =
    auth.dialog === "pin"
      ? "Choose a 5-digit PIN to confirm bank transfers."
      : auth.dialog === "bank"
        ? "Verify your NFBank account, then confirm with your withdrawal PIN."
        : "Review the amount and confirm with your withdrawal PIN.";
  const pinInput = (
    <AuthInput
      compact
      id="withdraw-pin"
      label={auth.dialog === "pin" ? "New 5-digit PIN" : "Withdrawal PIN"}
      type="password"
      inputMode="numeric"
      autoComplete="off"
      maxLength={5}
      disabled={auth.busy}
      value={auth.pin}
      onChange={(event) => auth.setPin(event.target.value)}
    />
  );
  return (
    <>
      {original ? (
        <PaymentResult
          kind="WITHDRAWAL"
          {...auth.status}
          onRefresh={auth.status.refresh}
        >
          {completed ? (
            <button
              type="button"
              className={styles.primary}
              onClick={() => auth.pending.save(null)}
            >
              Make another withdrawal
            </button>
          ) : (
            !auth.status.order && (
              <button
                type="button"
                className={styles.textButton}
                disabled={auth.busy || auth.loading}
                onClick={() => auth.open("confirm")}
              >
                Retry this request safely
              </button>
            )
          )}
        </PaymentResult>
      ) : (
        <div className={styles.layout}>
          <div>
            {auth.loading ? (
              <p className={styles.notice} role="status">
                Loading withdrawal details...
              </p>
            ) : auth.loadError ? (
              <>
                <p role="alert" className={styles.error}>
                  {auth.loadError}
                </p>
                <button
                  className={styles.button}
                  onClick={auth.retry}
                  type="button"
                >
                  Try again
                </button>
              </>
            ) : (
              <>
                {!auth.isPinSet && (
                  <section className={styles.section}>
                    <h2>Protect your withdrawals</h2>
                    <p className={styles.description}>
                      Set a withdrawal PIN before linking a bank account.
                    </p>
                    <button
                      className={styles.button}
                      type="button"
                      onClick={() => auth.open("pin")}
                    >
                      Set withdrawal PIN
                    </button>
                  </section>
                )}
                <section className={styles.section}>
                  <h2>Bank account</h2>
                  <p className={styles.description}>
                    Choose where to receive your money.
                  </p>
                  <div className={styles.bankList}>
                    {auth.accounts.map((account) => (
                      <button
                        key={account.id}
                        type="button"
                        className={styles.bank}
                        aria-pressed={auth.selected === account.id}
                        onClick={() => auth.setSelected(account.id)}
                      >
                        <span>
                          <strong>{account.accountName}</strong>
                          <small>
                            {account.bankName || "NFBank"} &middot; ****{" "}
                            {account.accountNumber.slice(-4)}
                          </small>
                        </span>
                        <span aria-hidden="true" className={styles.bankCheck}>
                          {auth.selected === account.id && <Check size={18} />}
                        </span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={styles.button}
                    disabled={!auth.isPinSet}
                    onClick={() => auth.open("bank")}
                  >
                    + Link a bank account
                  </button>
                </section>
                <section className={styles.section}>
                  <h2>Withdrawal amount</h2>
                  <WalletAmountField
                    id="withdraw-amount"
                    presets={[50000, 100000, 200000, 500000, 1000000, 2000000]}
                    amount={auth.amount}
                    rate={rate.rate}
                    withdrawal
                    onChange={auth.setAmount}
                  />
                </section>
              </>
            )}
          </div>
          <aside className={styles.summary}>
            <h2>Review withdrawal</h2>
            <dl className={styles.receipt}>
              <div>
                <dt>Destination</dt>
                <dd>{selected ? selected.accountName : "Choose an account"}</dd>
              </div>
              <div>
                <dt>Coins to deduct</dt>
                <dd>
                  {coins !== null && coins > 0 ? formatCoins(coins) : "--"}
                </dd>
              </div>
              <div className={styles.total}>
                <dt>Bank transfer</dt>
                <dd>
                  {Number.isSafeInteger(amount) ? formatVnd(amount) : "--"}
                </dd>
              </div>
            </dl>
            <p className={styles.notice}>
              The final Coin amount is calculated at submission. Pending
              requests stay visible until the result is confirmed.
            </p>
            {blockerHint && (
              <p role="alert" className={styles.error}>
                {blockerHint}
              </p>
            )}
            {rate.error && (
              <>
                <p role="alert" className={styles.error}>
                  {rate.error}
                </p>
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={rate.retry}
                >
                  Retry exchange rate
                </button>
              </>
            )}
            <button
              type="button"
              className={styles.primary + " " + styles.wide}
              disabled={blocked}
              onClick={() => auth.open("confirm")}
            >
              Review and withdraw
            </button>
          </aside>
        </div>
      )}
      <ContentDialog
        open={Boolean(auth.dialog)}
        title={dialogTitle}
        subtitle={dialogDescription}
        hideGradient
        onClose={auth.close}
        className={styles.dialog}
      >
        {auth.dialog && (
          <form
            noValidate
            className={styles.form}
            aria-busy={auth.busy}
            onSubmit={(event) => {
              event.preventDefault();
              void (auth.dialog === "pin"
                ? auth.submitPin()
                : auth.dialog === "bank"
                  ? auth.submitBank()
                  : auth.submitWithdrawal());
            }}
          >
            {auth.dialog === "pin" ? (
              <>
                {pinInput}
                <AuthInput
                  compact
                  id="confirm-withdraw-pin"
                  label="Confirm withdrawal PIN"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={5}
                  disabled={auth.busy}
                  value={auth.confirmPin}
                  onChange={(event) => auth.setConfirmPin(event.target.value)}
                />
              </>
            ) : auth.dialog === "bank" ? (
              <>
                <AuthInput
                  compact
                  id="bank-number"
                  label="NFBank account number"
                  inputMode="numeric"
                  maxLength={30}
                  disabled={auth.busy}
                  value={auth.accountNumber}
                  onChange={(event) =>
                    auth.setAccountNumber(event.target.value)
                  }
                />
                {auth.accountName && (
                  <>
                    <p className={styles.description}>
                      Account holder: <strong>{auth.accountName}</strong>
                    </p>
                    {pinInput}
                  </>
                )}
              </>
            ) : (
              <>
                <dl className={styles.receipt}>
                  <div>
                    <dt>Amount</dt>
                    <dd>{formatVnd(amount)}</dd>
                  </div>
                  <div>
                    <dt>Coins</dt>
                    <dd>
                      {auth.status.order
                        ? formatCoins(auth.status.order.coinAmount)
                        : coins !== null
                          ? formatCoins(coins)
                          : "Calculated at submission"}
                    </dd>
                  </div>
                </dl>
                {pinInput}
                {original && (
                  <p className={styles.notice}>
                    This retries the original request with the same reference.
                    It does not create a second transfer.
                  </p>
                )}
              </>
            )}

            {auth.error && (
              <p role="alert" className={styles.error}>
                {auth.error}
              </p>
            )}

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.textButton}
                disabled={auth.busy}
                onClick={auth.close}
              >
                Cancel
              </button>

              <button
                type="submit"
                className={styles.primary}
                disabled={auth.busy}
              >
                {auth.busy
                  ? "Please wait..."
                  : auth.dialog === "pin"
                    ? "Set PIN"
                    : auth.dialog === "bank"
                      ? auth.accountName
                        ? "Link account"
                        : "Verify account"
                      : "Confirm withdrawal"}
              </button>
            </div>
          </form>
        )}
      </ContentDialog>
    </>
  );
}

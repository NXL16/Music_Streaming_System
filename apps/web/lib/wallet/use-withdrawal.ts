"use client";
import { useEffect, useRef, useState } from "react";
import { getApiErrorStatus } from "@/lib/api/api-error";
import {
  createNFBankWithdrawal,
  getWithdrawStatus,
  getWithdrawStatusSnapshot,
  cacheWithdrawStatus,
  linkBankAccount,
  setWithdrawPin,
  verifyNFBankAccount,
} from "./wallet.api";
import { useWalletOperation } from "./use-wallet-operation";
import { usePaymentOrder } from "./use-payment-order";
import { validatePaymentAmount, isPaymentFinal } from "./payment";

export function useWithdrawal() {
  const pending = useWalletOperation("WITHDRAWAL");
  const status = usePaymentOrder(
    "WITHDRAWAL",
    pending.operation?.reference || null,
  );
  const [details, setDetails] = useState(getWithdrawStatusSnapshot);
  const accounts = details?.bankAccounts ?? [];
  const isPinSet = details?.isPinSet ?? false;
  const [loading, setLoading] = useState(!details);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(
    () =>
      accounts.find((account) => account.isDefault)?.id ||
      accounts[0]?.id ||
      "",
  );
  const [amount, setAmount] = useState("50000");
  const [dialog, setDialog] = useState<"pin" | "bank" | "confirm" | null>(null);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await getWithdrawStatus();
        if (cancelled) return;
        setDetails(data);
        setSelected(
          (current) =>
            current ||
            data.bankAccounts?.find((account) => account.isDefault)?.id ||
            data.bankAccounts?.[0]?.id ||
            "",
        );
        setLoadError("");
      } catch {
        if (!cancelled)
          setLoadError(
            "We couldn't load withdrawal details. Please try again.",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [revision]);
  function close() {
    if (lock.current) return;
    setDialog(null);
    setPin("");
    setConfirmPin("");
    setAccountNumber("");
    setAccountName("");
    setError("");
  }
  function open(next: "pin" | "bank" | "confirm") {
    if (lock.current) return;
    setPin("");
    setConfirmPin("");
    setAccountNumber("");
    setAccountName("");
    setError("");
    setDialog(next);
  }
  async function submitPin() {
    if (lock.current) return;
    if (!/^\d{5}$/.test(pin)) {
      setError("Enter a 5-digit withdrawal PIN.");
      return;
    }
    if (pin !== confirmPin) {
      setError("The PINs don't match.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await setWithdrawPin(pin);
      const data = { isPinSet: true, bankAccounts: accounts };
      cacheWithdrawStatus(data);
      setDetails(data);
      lock.current = false;
      close();
    } catch {
      setError("Could not set your withdrawal PIN. Please try again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function submitBank() {
    if (lock.current) return;
    if (!/^\d{6,30}$/.test(accountNumber)) {
      setError("Enter a bank account number with 6–30 digits.");
      return;
    }
    if (accountName && !/^\d{5}$/.test(pin)) {
      setError("Enter your 5-digit withdrawal PIN.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (!accountName) {
        const verified = await verifyNFBankAccount(accountNumber);
        if (!verified.accountName) throw new Error("Account unavailable");
        setAccountName(verified.accountName);
      } else {
        const bank = await linkBankAccount({
          accountNumber,
          pin,
          bankCode: "NFBANK",
        });
        const data = {
          isPinSet,
          bankAccounts: [
            bank,
            ...accounts.filter((item) => item.id !== bank.id),
          ],
        };
        cacheWithdrawStatus(data);
        setDetails(data);
        setSelected(bank.id);
        lock.current = false;
        close();
      }
    } catch {
      setError(
        "Could not verify or link this account. Check the account number and PIN, then try again.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function submitWithdrawal() {
    if (lock.current || !pending.ready) return;
    const original = pending.operation;
    const amountVnd = original?.amountVnd ?? Number(amount);
    const bankAccountId = original?.bankAccountId || selected;
    const validation = validatePaymentAmount(amountVnd);
    if (validation || !bankAccountId || !/^\d{5}$/.test(pin)) {
      setError(
        validation || "Select a bank account and enter your 5-digit PIN.",
      );
      return;
    }
    if (isPaymentFinal(status.order)) return;
    const operation = original || {
      reference: crypto.randomUUID(),
      amountVnd,
      bankAccountId,
    };
    if (!pending.save(operation)) {
      setError(
        "This browser couldn't preserve your request. Enable session storage before withdrawing.",
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await createNFBankWithdrawal({
        pin,
        amountVnd,
        bankAccountId,
        idempotencyKey: operation.reference,
      });
      lock.current = false;
      close();
      status.refresh();
    } catch (cause) {
      const code = getApiErrorStatus(cause);
      if (code && [400, 401, 403, 409, 422, 429].includes(code)) {
        if (!original) pending.save(null);
        setError(
          "Could not submit this request. Check your PIN, balance and bank account, then try again.",
        );
      } else {
        lock.current = false;
        close();
        status.refresh();
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return {
    accounts,
    isPinSet,
    loading,
    loadError,
    retry: () => {
      setLoading(!details);
      setRevision((value) => value + 1);
    },
    selected,
    setSelected,
    amount,
    setAmount,
    dialog,
    open,
    close,
    pin,
    setPin,
    confirmPin,
    setConfirmPin,
    accountNumber,
    setAccountNumber: (value: string) => {
      setAccountNumber(value);
      setAccountName("");
    },
    accountName,
    error,
    busy,
    submitPin,
    submitBank,
    submitWithdrawal,
    pending,
    status,
  };
}

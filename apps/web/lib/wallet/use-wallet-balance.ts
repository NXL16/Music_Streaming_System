"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { useAuthStore } from "@/lib/auth/auth-store";
import {
  getWalletBalance,
  refreshWalletBalance,
  type WalletBalanceResponse,
} from "./wallet.api";
import { useMinimumLoadingState } from "@/lib/loading/use-minimum-loading-duration";

const WALLET_BALANCE_UPDATED_EVENT = "wallet:balance-updated";

export function useWalletBalance() {
  const status = useAuthStore((state) => state.status);
  const [balance, setBalance] = useState<WalletBalanceResponse | null>(null);
  const [loading, setLoading] = useMinimumLoadingState();
  const [error, setError] = useState("");
  const requestRunning = useRef(false);

  const loadBalance = useCallback(async (isSilent = false, forceRefresh = false) => {
    if (status !== "authenticated" || requestRunning.current) {
      return;
    }
    requestRunning.current = true;

    if (!isSilent) {
      setLoading(true);
    }
    setError("");

    try {
      const data = forceRefresh
        ? await refreshWalletBalance()
        : await getWalletBalance();
      setBalance(data);
      window.dispatchEvent(
        new CustomEvent<WalletBalanceResponse>(WALLET_BALANCE_UPDATED_EVENT, {
          detail: data,
        }),
      );
    } catch (err) {
      setError(
        getApiErrorMessage(
          err,
          "Không thể tải thông tin số dư ví của bạn."
        )
      );
    } finally {
      requestRunning.current = false;
      if (!isSilent) {
        setLoading(false);
      }
    }
  }, [setLoading, status]);

  useEffect(() => {
    if (status === "authenticated") {
      queueMicrotask(() => void loadBalance());
    } else {
      queueMicrotask(() => setBalance(null));
    }
  }, [status, loadBalance]);

  useEffect(() => {
    function handleBalanceUpdated(event: Event) {
      const updatedBalance = (event as CustomEvent<WalletBalanceResponse>).detail;
      if (updatedBalance) setBalance(updatedBalance);
    }

    window.addEventListener(WALLET_BALANCE_UPDATED_EVENT, handleBalanceUpdated);
    return () =>
      window.removeEventListener(
        WALLET_BALANCE_UPDATED_EVENT,
        handleBalanceUpdated,
      );
  }, []);

  useEffect(() => {
    const refreshVisible = () => { if (document.visibilityState === "visible") void loadBalance(true, true); };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => { window.removeEventListener("focus", refreshVisible); document.removeEventListener("visibilitychange", refreshVisible); };
  }, [loadBalance]);

  const refreshBalance = useCallback(() => void loadBalance(true, true), [loadBalance]);
  const refreshBalanceWithLoading = useCallback(() => void loadBalance(false), [loadBalance]);

  return {
    balance,
    loading,
    error,
    refreshBalance,
    refreshBalanceWithLoading,
  };
}

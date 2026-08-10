"use client";

import { useEffect, useState, useCallback } from "react";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { useAuthStore } from "@/lib/auth/auth-store";
import { getWalletBalance, type WalletBalanceResponse } from "./wallet.api";
import { useMinimumLoadingState } from "@/lib/loading/use-minimum-loading-duration";

export function useWalletBalance() {
  const status = useAuthStore((state) => state.status);
  const [balance, setBalance] = useState<WalletBalanceResponse | null>(null);
  const [loading, setLoading] = useMinimumLoadingState();
  const [error, setError] = useState("");

  const loadBalance = useCallback(async (isSilent = false) => {
    if (status !== "authenticated") {
      return;
    }

    if (!isSilent) {
      setLoading(true);
    }
    setError("");

    try {
      const data = await getWalletBalance();
      setBalance(data);
    } catch (err) {
      setError(
        getApiErrorMessage(
          err,
          "Không thể tải thông tin số dư ví của bạn."
        )
      );
    } finally {
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

  return {
    balance,
    loading,
    error,
    refreshBalance: () => void loadBalance(true),
    refreshBalanceWithLoading: () => void loadBalance(false),
  };
}

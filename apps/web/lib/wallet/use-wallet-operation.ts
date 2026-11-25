"use client";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useAuthStore } from "@/lib/auth/auth-store";
import type { PaymentKind } from "./wallet.api";

export type WalletOperation = {
  reference: string;
  amountVnd?: number;
  bankAccountId?: string;
  paymentUrl?: string;
  deepLink?: string | null;
};
const OPERATION_CHANGED = "wallet:operation-changed";
const serverSnapshot = () => undefined;

function subscribe(listener: () => void) {
  window.addEventListener(OPERATION_CHANGED, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(OPERATION_CHANGED, listener);
    window.removeEventListener("storage", listener);
  };
}

export function useWalletOperation(kind: PaymentKind) {
  const userId = useAuthStore((state) => state.user?.userId);
  const key = "wallet:operation:" + kind + ":" + userId;
  const snapshot = useSyncExternalStore(
    subscribe,
    useCallback(() => {
      if (!userId) return undefined;
      try {
        return sessionStorage.getItem(key);
      } catch {
        return null;
      }
    }, [key, userId]),
    serverSnapshot,
  );
  const operation = useMemo<WalletOperation | null>(() => {
    try {
      const data = JSON.parse(snapshot || "null");
      if (
        data &&
        typeof data.reference === "string" &&
        /^[A-Za-z0-9_-]{1,128}$/.test(data.reference)
      )
        return data;
    } catch {
      return null;
    }
    return null;
  }, [snapshot]);
  const save = useCallback(
    (value: WalletOperation | null) => {
      if (!userId) return false;
      try {
        if (value) sessionStorage.setItem(key, JSON.stringify(value));
        else sessionStorage.removeItem(key);
        window.dispatchEvent(new Event(OPERATION_CHANGED));
        return true;
      } catch {
        return false;
      }
    },
    [key, userId],
  );
  return {
    operation,
    save,
    ready: snapshot !== undefined,
  };
}

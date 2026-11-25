"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getPaymentOrder,
  type PaymentKind,
  type PaymentOrder,
} from "./wallet.api";
import { isPaymentFinal } from "./payment";

export function usePaymentOrder(kind: PaymentKind, reference: string | null) {
  const [savedOrder, setOrder] = useState<{
    key: string;
    data: PaymentOrder;
  } | null>(null);
  const key = kind + ":" + reference;
  const order = savedOrder?.key === key ? savedOrder.data : null;
  const [failureKey, setError] = useState<string | null>(null);
  const [checkingKey, setChecking] = useState<string | null>(null);
  const manualCheck = useRef<(() => void) | null>(null);
  const refresh = useCallback(() => manualCheck.current?.(), []);
  useEffect(() => {
    if (!reference) return;
    const paymentReference = reference;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let deadline = performance.now() + 120_000;
    let running = false;
    let final = false;
    async function check(manual = false) {
      if (final || controller.signal.aborted) return;
      if (manual) setChecking(key);
      if (running) return;
      running = true;
      clearTimeout(timer);
      try {
        const saved = await getPaymentOrder(
          kind,
          paymentReference,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setOrder((current) =>
          current?.key === key && current.data.status === saved.status
            ? current
            : { key, data: saved },
        );
        setError(null);
        final = isPaymentFinal(saved);
        if (final) return;
      } catch {
        if (controller.signal.aborted) return;
        setError(key);
      } finally {
        running = false;
        if (!controller.signal.aborted) setChecking(null);
      }
      if (!controller.signal.aborted && performance.now() < deadline)
        timer = setTimeout(() => void check(), 4_000);
    }
    manualCheck.current = () => {
      deadline = performance.now() + 120_000;
      void check(true);
    };
    function resume() {
      if (document.visibilityState !== "visible") return;
      deadline = performance.now() + 120_000;
      void check();
    }
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    void check();
    return () => {
      controller.abort();
      manualCheck.current = null;
      clearTimeout(timer);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [kind, reference, key]);
  return {
    order,
    error: failureKey === key ? "Unable to confirm payment. Try again." : "",
    checking: checkingKey === key,
    refresh,
  };
}

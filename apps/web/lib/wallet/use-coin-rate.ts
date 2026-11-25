"use client";
import { useEffect, useState } from "react";
import { getCoinRate, type CoinRate } from "./wallet.api";
import {
  getCachedQuery,
  getCachedQuerySnapshot,
  invalidateCachedQuery,
} from "@/lib/api/query-cache";
import { quoteCoins } from "./payment";

const RATE_KEY = "wallet:coin-rate";
const RATE_TTL = 5 * 60_000;

function readSavedRate(): CoinRate | null {
  try {
    const cached = JSON.parse(sessionStorage.getItem(RATE_KEY) || "null");
    const age = Date.now() - cached?.savedAt;
    return age >= 0 &&
      age < RATE_TTL &&
      quoteCoins(10_000, cached.rate) !== null
      ? cached.rate
      : null;
  } catch {
    return null;
  }
}

async function loadRate(signal: AbortSignal) {
  const value = await getCoinRate(signal);
  if (quoteCoins(10_000, value) === null)
    throw new Error("Invalid exchange rate");
  try {
    sessionStorage.setItem(
      RATE_KEY,
      JSON.stringify({ rate: value, savedAt: Date.now() }),
    );
  } catch {
    return value;
  }
  return value;
}

export function useCoinRate() {
  const [rate, setRate] = useState<CoinRate | null>(
    () => getCachedQuerySnapshot<CoinRate>(RATE_KEY) ?? null,
  );
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const cached =
        getCachedQuerySnapshot<CoinRate>(RATE_KEY) ?? readSavedRate();
      if (cached) setRate(cached);
      try {
        const value = await getCachedQuery(RATE_KEY, loadRate, RATE_TTL);
        if (cancelled) return;
        setRate(value);
        setError("");
      } catch {
        if (!cancelled)
          setError(
            "The current exchange rate is unavailable. Please try again.",
          );
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [revision]);
  return {
    rate,
    error,
    retry: () => {
      invalidateCachedQuery(RATE_KEY);
      setRevision((value) => value + 1);
    },
  };
}

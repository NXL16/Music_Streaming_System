"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMinimumLoadingDuration } from "@/lib/loading/use-minimum-loading-duration";

type InfiniteScrollSentinelOptions = {
  enabled: boolean;
  loading: boolean;
  onLoadMore: () => void;
  rootMargin?: string;
  loadDelayMs?: number;
};

/**
 * Observes a list's trailing sentinel inside the application scroll container.
 * Data fetching and cursor ownership stay with the domain hook/page; this hook
 * only owns the repeated observer lifecycle.
 */
export function useInfiniteScrollSentinel({
  enabled,
  loading,
  onLoadMore,
  rootMargin = "0px",
}: InfiniteScrollSentinelOptions) {
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    setSentinel(node);
  }, []);

  useEffect(() => {
    if (
      !sentinel ||
      !enabled ||
      loading ||
      !("IntersectionObserver" in window)
    ) {
      return;
    }

    const root = document.querySelector<HTMLElement>(
      "[data-app-scroll-container]",
    );
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onLoadMore();
      },
      { root, rootMargin },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled, loading, onLoadMore, rootMargin, sentinel]);

  return sentinelRef;
}

/**
 * Standard presentation contract for every cursor-backed list: one observer,
 * no concurrent loads, and a non-flashing trailing spinner.
 */
export function useInfiniteScrollLoadMore({
  enabled,
  loading,
  onLoadMore,
  rootMargin,
  loadDelayMs = 300,
}: InfiniteScrollSentinelOptions) {
  const delayedLoadTimerRef = useRef<number | null>(null);
  const delayedLoadPendingRef = useRef(false);
  const [isDelayPending, setIsDelayPending] = useState(false);
  const triggerLoadMore = useCallback(() => {
    if (delayedLoadPendingRef.current) return;

    if (!loadDelayMs) {
      onLoadMore();
      return;
    }

    delayedLoadPendingRef.current = true;
    setIsDelayPending(true);
    delayedLoadTimerRef.current = window.setTimeout(() => {
      delayedLoadTimerRef.current = null;
      delayedLoadPendingRef.current = false;
      setIsDelayPending(false);
      onLoadMore();
    }, loadDelayMs);
  }, [loadDelayMs, onLoadMore]);

  useEffect(
    () => () => {
      if (delayedLoadTimerRef.current !== null) {
        window.clearTimeout(delayedLoadTimerRef.current);
      }
    },
    [],
  );

  const sentinelRef = useInfiniteScrollSentinel({
    enabled,
    loading,
    onLoadMore: triggerLoadMore,
    rootMargin,
  });
  const showLoadingMore = useMinimumLoadingDuration(loading || isDelayPending);

  return { sentinelRef, showLoadingMore };
}

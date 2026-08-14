"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SetStateAction,
} from "react";

const DEFAULT_MINIMUM_LOADING_MS = 300;

/** Keeps a visible loading state on screen long enough to avoid a flash. */
export function useMinimumLoadingDuration(
  isLoading: boolean,
  minimumDurationMs = DEFAULT_MINIMUM_LOADING_MS,
) {
  const [isVisible, setIsVisible] = useState(isLoading);
  const visibleSinceRef = useRef(0);

  useEffect(() => {
    if (isLoading) {
      if (!visibleSinceRef.current) visibleSinceRef.current = Date.now();
      if (isVisible) return;

      const timer = window.setTimeout(() => setIsVisible(true), 0);
      return () => window.clearTimeout(timer);
    }

    if (!isVisible) return;

    const elapsed = Date.now() - visibleSinceRef.current;
    const remaining = Math.max(0, minimumDurationMs - elapsed);
    const timer = window.setTimeout(() => {
      visibleSinceRef.current = 0;
      setIsVisible(false);
    }, remaining);

    return () => window.clearTimeout(timer);
  }, [isLoading, isVisible, minimumDurationMs]);

  return isLoading || isVisible;
}

/**
 * State variant for request hooks. It exposes one loading value for the UI
 * while retaining the familiar `setLoading(true|false)` request lifecycle.
 */
export function useMinimumLoadingState(
  initialLoading = false,
  minimumDurationMs = DEFAULT_MINIMUM_LOADING_MS,
) {
  const [isLoading, setIsLoadingState] = useState(initialLoading);
  const loading = useMinimumLoadingDuration(isLoading, minimumDurationMs);
  const setLoading = useCallback(
    (next: SetStateAction<boolean>) => setIsLoadingState(next),
    [],
  );

  return [loading, setLoading] as const;
}

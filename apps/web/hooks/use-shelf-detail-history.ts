"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  getAppScrollPosition,
  holdManualAppScrollRestoration,
  scrollAppToPosition,
} from "@/lib/layout/use-app-scroll-to-top";
import { getShelfDetailHistoryCache } from "./shelf-detail-history-cache";

const HISTORY_KEY = "__shelfDetail";

type Options<T> = {
  owner: string;
  selected: T | null;
  setSelected: Dispatch<SetStateAction<T | null>>;
  getKey: (value: T) => string;
  restoreScroll?: boolean;
  scrollReady?: boolean;
};

export function useShelfDetailHistory<T>({
  owner,
  selected,
  setSelected,
  getKey,
  restoreScroll = false,
  scrollReady = true,
}: Options<T>) {
  const historyCache = useMemo(
    () => getShelfDetailHistoryCache<T>(owner),
    [owner],
  );
  const cache = historyCache.values;
  const isClosing = useRef(false);
  const scrollPositions = historyCache.scrollPositions;
  const currentScrollKey = useRef(JSON.stringify([owner, null]));
  const pendingScroll = useRef<ReturnType<typeof getAppScrollPosition> | null>(
    null,
  );
  const pageUrl = useRef<string | null>(null);
  const selectedKey = selected ? getKey(selected) : null;

  const prepareScroll = useCallback(
    (key: string | null, reset = false) => {
      if (!restoreScroll) return;
      scrollPositions.set(
        currentScrollKey.current,
        pendingScroll.current ?? getAppScrollPosition(),
      );
      pendingScroll.current = reset
        ? { top: 0, left: 0 }
        : (scrollPositions.get(JSON.stringify([owner, key])) ?? {
            top: 0,
            left: 0,
          });
    },
    [owner, restoreScroll, scrollPositions],
  );

  const readSelection = useCallback(
    (state: Record<string, unknown> | null) => {
      const entry = state?.[HISTORY_KEY] as
        { owner: string; key: string } | undefined;
      if (entry?.owner !== owner) return null;
      const value = cache.get(entry.key);
      if (value !== undefined) return value;
      const nextState = { ...state };
      delete nextState[HISTORY_KEY];
      window.history.replaceState(nextState, "");
      return null;
    },
    [cache, owner],
  );

  useLayoutEffect(() => {
    setSelected(readSelection(window.history.state));
  }, [readSelection, setSelected]);

  useLayoutEffect(() => {
    if (!restoreScroll) return;
    pageUrl.current = window.location.href;
    pendingScroll.current = null;
    return holdManualAppScrollRestoration();
  }, [owner, restoreScroll]);

  useLayoutEffect(() => {
    currentScrollKey.current = JSON.stringify([owner, selectedKey]);
    const position = pendingScroll.current;
    if (
      restoreScroll &&
      position &&
      (scrollReady || (position.top === 0 && position.left === 0))
    ) {
      pendingScroll.current = null;
      scrollAppToPosition(position);
    }
  }, [owner, restoreScroll, scrollReady, selectedKey]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      isClosing.current = false;
      const entry = event.state?.[HISTORY_KEY];
      const next = readSelection(event.state);
      if (restoreScroll && window.location.href === pageUrl.current) {
        prepareScroll(next ? entry.key : null);
      }
      setSelected(next);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [prepareScroll, readSelection, restoreScroll, setSelected]);

  useEffect(() => {
    isClosing.current = false;
  }, [owner]);

  const isCurrent = useCallback(
    (key: string) => {
      const entry = window.history.state?.[HISTORY_KEY];
      return (
        entry?.owner === owner &&
        entry.key === key &&
        (!restoreScroll || window.location.href === pageUrl.current)
      );
    },
    [owner, restoreScroll],
  );

  const update = useCallback(
    (key: string, updater: (value: T) => T) => {
      const current = cache.get(key);
      if (current === undefined) return;
      const next = updater(current);
      cache.set(key, next);
      setSelected((selectedValue) =>
        selectedValue && getKey(selectedValue) === key ? next : selectedValue,
      );
    },
    [cache, getKey, setSelected],
  );

  const invalidate = useCallback(
    (key: string) => {
      cache.delete(key);
      scrollPositions.delete(JSON.stringify([owner, key]));
    },
    [cache, owner, scrollPositions],
  );

  const open = useCallback(
    (value: T) => {
      if (isClosing.current) return;

      const key = getKey(value);
      cache.set(key, value);
      const currentState = window.history.state;
      const state =
        typeof currentState === "object" && currentState !== null
          ? currentState
          : {};

      if (isCurrent(key)) {
        setSelected(value);
        return;
      }

      prepareScroll(key, true);
      window.history.pushState({ ...state, [HISTORY_KEY]: { owner, key } }, "");
      setSelected(value);
    },
    [cache, getKey, isCurrent, owner, prepareScroll, setSelected],
  );

  const close = useCallback(() => {
    if (isClosing.current) return;

    const entry = window.history.state?.[HISTORY_KEY];
    if (entry?.owner === owner) {
      isClosing.current = true;
      window.history.back();
      return;
    }
    prepareScroll(null);
    setSelected(null);
  }, [owner, prepareScroll, setSelected]);

  return { open, close, isCurrent, update, invalidate };
}

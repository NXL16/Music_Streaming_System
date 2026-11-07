"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";

const HISTORY_KEY = "__shelfDetail";

type Options<T> = {
  owner: string;
  selected: T | null;
  setSelected: Dispatch<SetStateAction<T | null>>;
  getKey: (value: T) => string;
};

export function useShelfDetailHistory<T>({
  owner,
  selected,
  setSelected,
  getKey,
}: Options<T>) {
  const cache = useRef(new Map<string, T>());
  const isClosing = useRef(false);

  useEffect(() => {
    if (selected) cache.current.set(getKey(selected), selected);
  }, [getKey, selected]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      isClosing.current = false;
      const entry = event.state?.[HISTORY_KEY];
      if (entry?.owner !== owner) {
        setSelected(null);
        return;
      }
      setSelected(cache.current.get(entry.key) ?? null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [owner, setSelected]);

  useEffect(() => {
    isClosing.current = false;
  }, [owner]);

  const open = useCallback(
    (value: T) => {
      if (isClosing.current) return;

      const key = getKey(value);
      cache.current.set(key, value);
      const currentState = window.history.state;
      const state =
        typeof currentState === "object" && currentState !== null
          ? currentState
          : {};

      if (
        state[HISTORY_KEY]?.owner === owner &&
        state[HISTORY_KEY]?.key === key
      ) {
        setSelected(value);
        return;
      }

      window.history.pushState({ ...state, [HISTORY_KEY]: { owner, key } }, "");
      setSelected(value);
    },
    [getKey, owner, setSelected],
  );

  const close = useCallback(() => {
    if (isClosing.current) return;

    const entry = window.history.state?.[HISTORY_KEY];
    if (entry?.owner === owner) {
      isClosing.current = true;
      window.history.back();
      return;
    }
    setSelected(null);
  }, [owner, setSelected]);

  return { open, close };
}

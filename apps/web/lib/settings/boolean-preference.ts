"use client";

import { useSyncExternalStore } from "react";

const getServerSnapshot = () => false;

export function createBooleanPreference(
  storageKey: string,
  getDefault: () => boolean,
  mediaQuery?: string,
) {
  const changeEvent = `${storageKey}-change`;
  let memoryValue: boolean | undefined;
  let storageOverride = false;

  function getSnapshot(): boolean {
    if (storageOverride && memoryValue !== undefined) return memoryValue;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === "true" || stored === "false") return stored === "true";
    } catch {
      if (memoryValue !== undefined) return memoryValue;
    }
    return getDefault();
  }

  function subscribe(onChange: () => void): () => void {
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) {
        storageOverride = false;
        onChange();
      }
    };
    const query = mediaQuery ? window.matchMedia(mediaQuery) : undefined;
    window.addEventListener("storage", onStorage);
    window.addEventListener(changeEvent, onChange);
    query?.addEventListener("change", onChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(changeEvent, onChange);
      query?.removeEventListener("change", onChange);
    };
  }

  function setEnabled(enabled: boolean): void {
    memoryValue = enabled;
    try {
      window.localStorage.setItem(storageKey, String(enabled));
      storageOverride = false;
    } catch {
      storageOverride = true;
    }
    window.dispatchEvent(new Event(changeEvent));
  }

  function useEnabled() {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  }

  return { useEnabled, setEnabled };
}

"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

const DEFAULT_VOLUME = 0.7;
const VOLUME_STORAGE_KEY = "music-player:volume:v1";
const VOLUME_CHANGE_EVENT = "music-player:volume-change";

type StoredVolume = {
  volume: number;
  lastAudibleVolume: number;
};

const DEFAULT_STORED_VOLUME: StoredVolume = {
  volume: DEFAULT_VOLUME,
  lastAudibleVolume: DEFAULT_VOLUME,
};
const DEFAULT_SNAPSHOT = JSON.stringify(DEFAULT_STORED_VOLUME);
let memorySnapshot = DEFAULT_SNAPSHOT;

function normalizeVolume(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, value));
}

function normalizeAudibleVolume(value: unknown, fallback: number): number {
  const volume = normalizeVolume(value, fallback);
  return volume > 0 ? volume : fallback;
}

function parseStoredVolume(snapshot: string): StoredVolume {
  try {
    const value: unknown = JSON.parse(snapshot);

    if (!value || typeof value !== "object") {
      return DEFAULT_STORED_VOLUME;
    }

    const stored = value as Partial<StoredVolume>;
    const volume = normalizeVolume(stored.volume, DEFAULT_VOLUME);

    return {
      volume,
      lastAudibleVolume: normalizeAudibleVolume(
        stored.lastAudibleVolume,
        volume > 0 ? volume : DEFAULT_VOLUME,
      ),
    };
  } catch {
    return DEFAULT_STORED_VOLUME;
  }
}

function getSnapshot(): string {
  try {
    return window.localStorage.getItem(VOLUME_STORAGE_KEY) ?? memorySnapshot;
  } catch {
    return memorySnapshot;
  }
}

function subscribe(onStoreChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === VOLUME_STORAGE_KEY) onStoreChange();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(VOLUME_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(VOLUME_CHANGE_EVENT, onStoreChange);
  };
}

function saveStoredVolume(stored: StoredVolume): void {
  const snapshot = JSON.stringify(stored);
  memorySnapshot = snapshot;

  try {
    window.localStorage.setItem(VOLUME_STORAGE_KEY, snapshot);
  } catch {
    // Privacy mode or storage quota can block persistence; retain it in memory.
  }

  window.dispatchEvent(new Event(VOLUME_CHANGE_EVENT));
}

export function usePersistentVolume() {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => DEFAULT_SNAPSHOT,
  );
  const storedVolume = useMemo(() => parseStoredVolume(snapshot), [snapshot]);

  const setVolume = useCallback(
    (nextVolume: number) => {
      const volume = normalizeVolume(nextVolume, DEFAULT_VOLUME);

      saveStoredVolume({
        volume,
        lastAudibleVolume:
          volume > 0 ? volume : storedVolume.lastAudibleVolume,
      });
    },
    [storedVolume.lastAudibleVolume],
  );

  return { ...storedVolume, setVolume };
}

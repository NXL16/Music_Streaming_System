"use client";

import { useSyncExternalStore } from "react";
import {
  getLibraryResourcesRevision,
  subscribeLibraryResourcesRevision,
} from "./library-resources.api";

/**
 * Re-renders Library surfaces as soon as the central resource cache changes.
 * Data fetches may finish later; pending-removal visibility never waits for
 * them because every surface reads the same registry from the cache module.
 */
export function useLibraryResourcesRevision() {
  return useSyncExternalStore(
    subscribeLibraryResourcesRevision,
    getLibraryResourcesRevision,
    () => 0,
  );
}

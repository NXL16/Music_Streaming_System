"use client";

import { useEffect, useRef, useState } from "react";
import { ensureFavoriteLibraryResource } from "@/lib/favorites/ensure-favorite-library-resource";
import {
  getLibraryMediaCards,
  type LibraryMediaCardResource,
} from "./library-resources.api";
import { useLibraryResourcesRevision } from "./use-library-resources-revision";

type Options = {
  userId?: string;
  ensureFavorite?: boolean;
  errorMessage: string;
};

/** Shared, stale-response-safe loader for Library card surfaces. */
export function useLibraryMediaCards({
  userId,
  ensureFavorite = false,
  errorMessage,
}: Options) {
  const revision = useLibraryResourcesRevision();
  const [resources, setResources] = useState<LibraryMediaCardResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestVersion = useRef(0);
  const hasLoadedRef = useRef(false);
  const loadedUserIdRef = useRef<string | undefined>(userId);

  useEffect(() => {
    const version = ++requestVersion.current;
    if (loadedUserIdRef.current !== userId) {
      loadedUserIdRef.current = userId;
      hasLoadedRef.current = false;
    }
    if (!userId) {
      queueMicrotask(() => {
        if (requestVersion.current !== version) return;
        setResources([]);
        setError("");
        setLoading(false);
      });
      return;
    }

    // A Library mutation only needs a background refresh. Preserving the
    // existing cards prevents the entire page from flashing its skeleton.
    if (!hasLoadedRef.current) setLoading(true);
    void (async () => {
      try {
        if (ensureFavorite) await ensureFavoriteLibraryResource();
        const cards = await getLibraryMediaCards();
        if (requestVersion.current !== version) return;
        setResources(cards);
        setError("");
        hasLoadedRef.current = true;
      } catch {
        if (requestVersion.current === version) setError(errorMessage);
      } finally {
        if (requestVersion.current === version) setLoading(false);
      }
    })();
  }, [ensureFavorite, errorMessage, revision, userId]);

  return { resources, loading, error };
}

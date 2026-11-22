"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ensureFavoriteLibraryResource } from "@/lib/favorites/ensure-favorite-library-resource";
import {
  getLibraryMediaCards,
  getLibraryMediaCardsSnapshot,
  type LibraryMediaCardResource,
} from "./library-resources.api";
import { useLibraryResourcesRevision } from "./use-library-resources-revision";
import {
  getFollowedArtists,
  getFollowedArtistsSnapshot,
  type FollowedArtist,
} from "@/lib/favorites/artist-follow.api";
import { subscribeArtistFollowChanges } from "@/lib/favorites/artist-follow-events";

type Options = {
  userId?: string;
  ensureFavorite?: boolean;
  includeArtists?: boolean;
  errorMessage: string;
};

/** Shared, stale-response-safe loader for Library card surfaces. */
export function useLibraryMediaCards({
  userId,
  ensureFavorite = false,
  includeArtists = false,
  errorMessage,
}: Options) {
  const revision = useLibraryResourcesRevision();
  const initialData = useMemo(() => {
    if (!userId) return undefined;
    const resources = getLibraryMediaCardsSnapshot();
    const followedArtists = includeArtists ? getFollowedArtistsSnapshot() : [];
    return resources && followedArtists
      ? { resources, followedArtists }
      : undefined;
  }, [userId, includeArtists]);
  const [result, setResult] = useState<{
    userId?: string;
    resources: LibraryMediaCardResource[];
    followedArtists: FollowedArtist[];
    error: string;
  }>({
    userId,
    resources: initialData?.resources ?? [],
    followedArtists: initialData?.followedArtists ?? [],
    error: "",
  });
  const [loading, setLoading] = useState(!initialData);
  const requestVersion = useRef(0);
  const hasLoadedRef = useRef(Boolean(initialData));
  const loadedUserIdRef = useRef<string | undefined>(userId);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!includeArtists) return;
    return subscribeArtistFollowChanges(({ pending }) => {
      if (pending) return;
      requestVersion.current += 1;
      setRetryKey((current) => current + 1);
    });
  }, [includeArtists]);

  useEffect(() => {
    const version = ++requestVersion.current;
    if (loadedUserIdRef.current !== userId) {
      loadedUserIdRef.current = userId;
      hasLoadedRef.current = false;
    }
    if (!userId) {
      queueMicrotask(() => {
        if (requestVersion.current !== version) return;
        setResult({ userId, resources: [], followedArtists: [], error: "" });
        setLoading(false);
      });
      return () => {
        requestVersion.current += 1;
      };
    }

    // A Library mutation only needs a background refresh. Preserving the
    // existing cards prevents the entire page from flashing its skeleton.
    if (!hasLoadedRef.current)
      queueMicrotask(() => {
        if (requestVersion.current === version) setLoading(true);
      });
    void (async () => {
      try {
        if (ensureFavorite) await ensureFavoriteLibraryResource();
        if (requestVersion.current !== version) return;
        const [cards, followedArtists] = await Promise.all([
          getLibraryMediaCards(),
          includeArtists ? getFollowedArtists() : Promise.resolve([]),
        ]);
        if (requestVersion.current !== version) return;
        setResult({ userId, resources: cards, followedArtists, error: "" });
        hasLoadedRef.current = true;
      } catch {
        if (requestVersion.current === version)
          setResult((current) => ({
            userId,
            resources: current.userId === userId ? current.resources : [],
            followedArtists:
              current.userId === userId ? current.followedArtists : [],
            error: errorMessage,
          }));
      } finally {
        if (requestVersion.current === version) setLoading(false);
      }
    })();
    return () => {
      requestVersion.current += 1;
    };
  }, [
    ensureFavorite,
    includeArtists,
    errorMessage,
    revision,
    retryKey,
    userId,
  ]);

  const belongsToUser = result.userId === userId;
  return {
    resources: belongsToUser ? result.resources : [],
    followedArtists: belongsToUser ? result.followedArtists : [],
    loading: Boolean(userId) && (loading || !belongsToUser),
    error: belongsToUser ? result.error : "",
    retry: () => setRetryKey((current) => current + 1),
  };
}

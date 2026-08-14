"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  invalidateUserPlaylists,
  listUserPlaylists,
  type UserPlaylistSummary,
} from "./user-playlists.api";
import { subscribeLibraryResourcesChanged } from "@/lib/library/library-resources.api";
import {
  appendUniqueById,
  getSafeNextCursor,
} from "@/lib/pagination/cursor-page";

const PAGE_SIZE = 24;

/** Cursor state shared by Library playlist surfaces; sidebar/menu use the full-list API. */
export function useUserPlaylistPages(userId?: string) {
  const [playlists, setPlaylists] = useState<UserPlaylistSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [isLoading, setIsLoading] = useState(Boolean(userId));
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const requestVersion = useRef(0);
  const hasLoadedRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const seenCursorsRef = useRef(new Set<string>());

  const reload = useCallback(async () => {
    const version = ++requestVersion.current;
    loadingMoreRef.current = false;
    seenCursorsRef.current = new Set();
    setIsLoadingMore(false);
    if (!userId) {
      setPlaylists([]);
      setNextCursor(undefined);
      setIsLoading(false);
      return;
    }

    // Keep the populated grid visible during background reconciliation after a
    // mutation. The full-page loader is only for the first load.
    if (!hasLoadedRef.current) setIsLoading(true);
    try {
      const page = await listUserPlaylists(userId, { limit: PAGE_SIZE });
      if (requestVersion.current !== version) return;
      setPlaylists(page.playlists);
      setNextCursor(
        getSafeNextCursor(page, seenCursorsRef.current) || undefined,
      );
      hasLoadedRef.current = true;
    } catch {
      if (requestVersion.current !== version) return;
      setPlaylists([]);
      setNextCursor(undefined);
    } finally {
      if (requestVersion.current === version) setIsLoading(false);
    }
  }, [userId]);

  const loadMore = useCallback(async () => {
    if (!userId || !nextCursor || loadingMoreRef.current) return;

    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    const version = requestVersion.current;
    try {
      const page = await listUserPlaylists(userId, {
        cursor: nextCursor,
        limit: PAGE_SIZE,
      });
      if (requestVersion.current !== version) return;
      setPlaylists((current) => appendUniqueById(current, page.playlists));
      setNextCursor(
        getSafeNextCursor(page, seenCursorsRef.current) || undefined,
      );
    } finally {
      if (requestVersion.current === version) {
        loadingMoreRef.current = false;
        setIsLoadingMore(false);
      }
    }
  }, [nextCursor, userId]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void reload();
    });
    const unsubscribe = subscribeLibraryResourcesChanged((change) => {
      if (!userId || change?.resourceType !== "playlists") return;

      if (change.operation === "pending-remove") {
        // Hide the card in the same render as the optimistic removal. Waiting
        // for a network round trip makes All Playlists flash its page loader.
        setPlaylists((current) =>
          current.filter((playlist) => playlist.id !== change.resourceId),
        );
        return;
      }

      invalidateUserPlaylists(userId);
      void reload();
    });
    return () => {
      active = false;
      requestVersion.current += 1;
      hasLoadedRef.current = false;
      unsubscribe();
    };
  }, [reload, userId]);

  return {
    playlists,
    hasMore: Boolean(nextCursor),
    isLoading,
    isLoadingMore,
    loadMore,
  };
}

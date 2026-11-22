"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCachedQuerySnapshot, setCachedQuery } from "@/lib/api/query-cache";
import {
  listUserPlaylists,
  type UserPlaylistSummary,
} from "./user-playlists.api";
import { invalidateUserPlaylists } from "./playlist-events";
import { subscribeLibraryResourcesChanged } from "@/lib/library/library-resources.api";
import {
  appendUniqueById,
  getSafeNextCursor,
} from "@/lib/pagination/cursor-page";

const PAGE_SIZE = 24;
type PlaylistSnapshot = {
  playlists: UserPlaylistSummary[];
  nextCursor: string;
  seenCursors: Set<string>;
};

export function useUserPlaylistPages(userId?: string) {
  const cacheKey = "user-playlist-pages:" + (userId ?? "guest");
  const cachedPage = useMemo(
    () =>
      userId ? getCachedQuerySnapshot<PlaylistSnapshot>(cacheKey) : undefined,
    [cacheKey, userId],
  );
  const [page, setPage] = useState({
    userId,
    playlists: cachedPage?.playlists ?? [],
    nextCursor: cachedPage?.nextCursor ?? "",
    seenCursors: cachedPage?.seenCursors ?? new Set<string>(),
  });
  const [isLoading, setIsLoading] = useState(Boolean(userId) && !cachedPage);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const requestVersion = useRef(0);
  const hasLoadedRef = useRef(Boolean(cachedPage));
  const loadingMoreRef = useRef(false);
  const pageRef = useRef(page);
  const commitPage = useCallback(
    (next: PlaylistSnapshot) => {
      pageRef.current = { ...next, userId };
      setPage(pageRef.current);
      if (userId) setCachedQuery(cacheKey, next);
    },
    [cacheKey, userId],
  );

  const reload = useCallback(
    async (force = true) => {
      const version = ++requestVersion.current;
      loadingMoreRef.current = true;
      setIsLoadingMore(Boolean(userId));
      setError("");
      if (!userId) {
        commitPage({ playlists: [], nextCursor: "", seenCursors: new Set() });
        setIsLoading(false);
        return;
      }
      if (pageRef.current.userId !== userId) hasLoadedRef.current = false;
      if (!hasLoadedRef.current) setIsLoading(true);
      try {
        const cached = force
          ? undefined
          : getCachedQuerySnapshot<PlaylistSnapshot>(cacheKey);
        if (cached) commitPage(cached);
        else {
          const response = await listUserPlaylists(userId, {
            limit: PAGE_SIZE,
          });
          if (requestVersion.current !== version) return;
          const seenCursors = new Set<string>();
          commitPage({
            playlists: response.playlists,
            nextCursor: getSafeNextCursor(response, seenCursors),
            seenCursors,
          });
        }
        hasLoadedRef.current = true;
      } catch {
        if (requestVersion.current === version)
          setError("Could not load your playlists.");
      } finally {
        if (requestVersion.current === version) {
          loadingMoreRef.current = false;
          setIsLoadingMore(false);
          setIsLoading(false);
        }
      }
    },
    [cacheKey, commitPage, userId],
  );

  const loadMore = useCallback(async () => {
    const current = pageRef.current;
    if (
      !userId ||
      current.userId !== userId ||
      !current.nextCursor ||
      loadingMoreRef.current
    )
      return;
    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    const version = requestVersion.current;
    try {
      const response = await listUserPlaylists(userId, {
        cursor: current.nextCursor,
        limit: PAGE_SIZE,
      });
      if (requestVersion.current !== version) return;
      const seenCursors = new Set(current.seenCursors);
      commitPage({
        playlists: appendUniqueById(current.playlists, response.playlists),
        nextCursor: getSafeNextCursor(response, seenCursors),
        seenCursors,
      });
    } catch {
      return;
    } finally {
      if (requestVersion.current === version) {
        loadingMoreRef.current = false;
        setIsLoadingMore(false);
      }
    }
  }, [commitPage, userId]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void reload(false);
    });
    const unsubscribe = subscribeLibraryResourcesChanged((change) => {
      if (
        !userId ||
        change?.resourceType !== "playlists" ||
        change.operation === "pin" ||
        change.operation === "unpin"
      )
        return;
      if (change.operation === "pending-remove") {
        if (!hasLoadedRef.current) {
          void reload();
          return;
        }
        requestVersion.current += 1;
        loadingMoreRef.current = false;
        setIsLoadingMore(false);
        commitPage({
          ...pageRef.current,
          playlists: pageRef.current.playlists.filter(
            (playlist) => playlist.id !== change.resourceId,
          ),
        });
        return;
      }
      invalidateUserPlaylists(userId);
      void reload();
    });
    return () => {
      active = false;
      requestVersion.current += 1;
      loadingMoreRef.current = false;
      unsubscribe();
    };
  }, [commitPage, reload, userId]);

  const belongsToUser = page.userId === userId;
  return {
    playlists: belongsToUser ? page.playlists : (cachedPage?.playlists ?? []),
    hasMore: Boolean(belongsToUser ? page.nextCursor : cachedPage?.nextCursor),
    isLoading:
      Boolean(userId) && (isLoading || (!belongsToUser && !cachedPage)),
    isLoadingMore: belongsToUser && isLoadingMore,
    error: belongsToUser ? error : "",
    loadMore,
    reload,
  };
}

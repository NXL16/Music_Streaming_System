"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAsyncResource } from "@/lib/api/use-async-resource";
import { getCachedQuerySnapshot, setCachedQuery } from "@/lib/api/query-cache";
import { getApiErrorMessage } from "@/lib/api/api-error";
import {
  getCatalogArtistSongPage,
  artistSongCachePrefix,
  getCatalogArtistSongPageSnapshot,
  invalidateCatalogArtistSongPages,
} from "./artist-song-pages";
import { useMinimumLoadingState } from "@/lib/loading/use-minimum-loading-duration";
import {
  appendUniqueById,
  getSafeNextCursor,
} from "@/lib/pagination/cursor-page";

type SongPage = Awaited<ReturnType<typeof getCatalogArtistSongPage>>;
type PaginationState = {
  firstPage: SongPage;
  songs: SongPage["songs"];
  nextCursor: string;
  seenCursors: Set<string>;
  error: string;
};

export function useCatalogArtistSongs(artistId: string) {
  const cacheKey = `${artistSongCachePrefix(artistId)}loaded`;
  const cachedPagination = useMemo(
    () => getCachedQuerySnapshot<PaginationState>(cacheKey),
    [cacheKey],
  );
  const initialData = useMemo(
    () =>
      cachedPagination?.firstPage ?? getCatalogArtistSongPageSnapshot(artistId),
    [artistId, cachedPagination],
  );
  const loadFirstPage = useCallback(
    () => getCatalogArtistSongPage(artistId),
    [artistId],
  );
  const {
    data: firstPage,
    loading,
    error,
    reload: reloadFirstPage,
  } = useAsyncResource(
    loadFirstPage,
    "Không thể tải danh sách bài hát của nghệ sĩ.",
    { initialData, enabled: Boolean(artistId) },
  );
  const firstPageState = useMemo(() => {
    if (!firstPage) return null;
    const seenCursors = new Set<string>();
    return {
      firstPage,
      songs: firstPage.songs,
      nextCursor: getSafeNextCursor(firstPage, seenCursors),
      seenCursors,
      error: "",
    };
  }, [firstPage]);
  const [pagination, setPagination] = useState<PaginationState | null>(
    cachedPagination ?? null,
  );
  const current =
    pagination?.firstPage === firstPage ? pagination : firstPageState;
  const [loadingMore, setLoadingMore] = useMinimumLoadingState();
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      activeRequest.current?.abort();
      activeRequest.current = null;
    },
    [artistId],
  );

  const loadMore = useCallback(async () => {
    if (!current?.nextCursor || loadingMore || activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoadingMore(true);
    setPagination({ ...current, error: "" });
    try {
      const page = await getCatalogArtistSongPage(artistId, {
        cursor: current.nextCursor,
      });
      if (controller.signal.aborted) return;
      const seenCursors = new Set(current.seenCursors);
      const next = {
        firstPage: current.firstPage,
        songs: appendUniqueById(current.songs, page.songs),
        nextCursor: getSafeNextCursor(page, seenCursors),
        seenCursors,
        error: "",
      };
      setCachedQuery(cacheKey, next);
      setPagination(next);
    } catch (requestError) {
      if (!controller.signal.aborted)
        setPagination({
          ...current,
          error: getApiErrorMessage(
            requestError,
            "Không thể tải thêm bài hát của nghệ sĩ.",
          ),
        });
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }, [artistId, cacheKey, current, loadingMore, setLoadingMore]);

  const reload = useCallback(() => {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setLoadingMore(false);
    setPagination(null);
    invalidateCatalogArtistSongPages(artistId);
    return reloadFirstPage();
  }, [artistId, reloadFirstPage, setLoadingMore]);

  return {
    songs: current?.songs ?? [],
    loading,
    loadingMore: loadingMore && pagination?.firstPage === firstPage,
    error: error || current?.error || "",
    hasMore: Boolean(current?.nextCursor),
    loadMore,
    reload,
  };
}

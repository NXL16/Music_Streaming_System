"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getApiErrorMessage } from "@/lib/api/api-error";
import {
  getCatalogArtistSongPage,
  invalidateCatalogArtistSongPages,
} from "./artist-song-pages";
import type { PlayerSong } from "@/lib/player/use-player-store";
import { useMinimumLoadingState } from "@/lib/loading/use-minimum-loading-duration";
import {
  appendUniqueById,
  getSafeNextCursor,
} from "@/lib/pagination/cursor-page";

export function useCatalogArtistSongs(artistId: string) {
  const [songs, setSongs] = useState<PlayerSong[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loading, setLoading] = useMinimumLoadingState(true);
  const [loadingMore, setLoadingMore] = useMinimumLoadingState();
  const [error, setError] = useState("");
  const isMountedRef = useRef(true);
  const loadMoreRequestIdRef = useRef(0);
  const seenCursorsRef = useRef(new Set<string>());

  const fetchFirstPage = useCallback(
    (force = false) => getCatalogArtistSongPage(artistId, { force }),
    [artistId],
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      loadMoreRequestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    let active = true;

    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      setLoadingMore(false);
      setError("");
      seenCursorsRef.current = new Set();

      fetchFirstPage()
        .then((page) => {
          if (!active) return;
          setSongs(page.songs);
          setNextCursor(
            getSafeNextCursor(page, seenCursorsRef.current) || undefined,
          );
        })
        .catch((requestError: unknown) => {
          if (active) {
            setError(
              getApiErrorMessage(
                requestError,
                "Không thể tải danh sách bài hát của nghệ sĩ.",
              ),
            );
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    });

    return () => {
      active = false;
    };
  }, [fetchFirstPage, setLoading, setLoadingMore]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;

    const requestId = ++loadMoreRequestIdRef.current;
    setLoadingMore(true);
    setError("");
    try {
      if (!isMountedRef.current || requestId !== loadMoreRequestIdRef.current) {
        return;
      }

      const page = await getCatalogArtistSongPage(artistId, {
        cursor: nextCursor,
      });
      if (!isMountedRef.current || requestId !== loadMoreRequestIdRef.current) {
        return;
      }
      setSongs((current) => appendUniqueById(current, page.songs));
      setNextCursor(
        getSafeNextCursor(page, seenCursorsRef.current) || undefined,
      );
    } catch (requestError) {
      if (isMountedRef.current && requestId === loadMoreRequestIdRef.current) {
        setError(
          getApiErrorMessage(
            requestError,
            "Không thể tải thêm bài hát của nghệ sĩ.",
          ),
        );
      }
    } finally {
      if (isMountedRef.current && requestId === loadMoreRequestIdRef.current) {
        setLoadingMore(false);
      }
    }
  }, [artistId, loadingMore, nextCursor, setLoadingMore]);

  const reload = useCallback(async () => {
    invalidateCatalogArtistSongPages(artistId);
    seenCursorsRef.current = new Set();
    setLoading(true);
    setError("");
    try {
      const page = await fetchFirstPage(true);
      if (!isMountedRef.current) return;
      setSongs(page.songs);
      setNextCursor(
        getSafeNextCursor(page, seenCursorsRef.current) || undefined,
      );
    } catch (requestError) {
      if (isMountedRef.current) {
        setError(
          getApiErrorMessage(
            requestError,
            "Không thể tải danh sách bài hát của nghệ sĩ.",
          ),
        );
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [artistId, fetchFirstPage, setLoading]);

  return {
    songs,
    loading,
    loadingMore,
    error,
    hasMore: Boolean(nextCursor),
    loadMore,
    reload,
  };
}

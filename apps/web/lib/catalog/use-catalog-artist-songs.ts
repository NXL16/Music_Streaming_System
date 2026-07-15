"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getApiErrorMessage } from "@/lib/api/api-error";
import {
  getCatalogArtistSongPage,
  invalidateCatalogArtistSongPages,
} from "./artist-song-pages";
import type { PlayerSong } from "@/lib/player/use-player-store";

const LOAD_MORE_DELAY_MS = 600;

export function useCatalogArtistSongs(artistId: string) {
  const [songs, setSongs] = useState<PlayerSong[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const isMountedRef = useRef(true);
  const loadMoreRequestIdRef = useRef(0);

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

      fetchFirstPage()
        .then((page) => {
          if (!active) return;
          setSongs(page.songs);
          setNextCursor(page.nextCursor);
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
  }, [fetchFirstPage]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;

    const requestId = ++loadMoreRequestIdRef.current;
    setLoadingMore(true);
    setError("");
    try {
      // Keep the loading state visible before fetching the next cursor page.
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, LOAD_MORE_DELAY_MS);
      });
      if (!isMountedRef.current || requestId !== loadMoreRequestIdRef.current) {
        return;
      }

      const page = await getCatalogArtistSongPage(artistId, {
        cursor: nextCursor,
      });
      if (!isMountedRef.current || requestId !== loadMoreRequestIdRef.current) {
        return;
      }
      setSongs((current) => {
        const existingIds = new Set(current.map((song) => song.id));
        return [
          ...current,
          ...page.songs.filter((song) => !existingIds.has(song.id)),
        ];
      });
      setNextCursor(page.nextCursor);
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
  }, [artistId, loadingMore, nextCursor]);

  const reload = useCallback(async () => {
    invalidateCatalogArtistSongPages(artistId);
    setLoading(true);
    setError("");
    try {
      const page = await fetchFirstPage(true);
      if (!isMountedRef.current) return;
      setSongs(page.songs);
      setNextCursor(page.nextCursor);
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
  }, [artistId, fetchFirstPage]);

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

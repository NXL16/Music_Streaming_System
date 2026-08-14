"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { deleteMySong, listMySongs } from "@/lib/songs/song.api";
import { subscribeSongLibraryChanged } from "@/lib/songs/song-library-events";
import type { SongSummary } from "@/lib/songs/song.types";
import { useMinimumLoadingState } from "@/lib/loading/use-minimum-loading-duration";
import {
  appendUniqueById,
  getSafeNextCursor,
} from "@/lib/pagination/cursor-page";

const POLLING_INTERVAL_MS = 5000;
const ACTIVE_PROCESSING_STATUSES = new Set([1, 2]);

function hasActiveProcessingSongs(songs: SongSummary[] | undefined) {
  return (
    songs?.some((song) => ACTIVE_PROCESSING_STATUSES.has(song.status)) ?? false
  );
}

export function useSongLibrary(refreshKey = 0) {
  const [songs, setSongs] = useState<SongSummary[]>([]);
  const [nextCursor, setNextCursor] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useMinimumLoadingState();
  const [loadingMore, setLoadingMore] = useMinimumLoadingState();
  const [deletingSongId, setDeletingSongId] = useState("");
  const [error, setError] = useState("");
  const hasProcessingRef = useRef(false);
  const requestVersionRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const seenCursorsRef = useRef(new Set<string>());

  const loadSongs = useCallback(
    async (options?: { silent?: boolean }) => {
      const requestVersion = ++requestVersionRef.current;
      loadingMoreRef.current = false;
      seenCursorsRef.current = new Set();
      setError("");

      if (!options?.silent) {
        setLoading(true);
      }

      try {
        const result = await listMySongs({ limit: 20 });
        const nextSongs = result.songs ?? [];
        if (requestVersion !== requestVersionRef.current) return;

        setSongs(nextSongs);
        const cursor = getSafeNextCursor(result, seenCursorsRef.current);
        setNextCursor(cursor);
        setHasMore(Boolean(cursor));
        hasProcessingRef.current = hasActiveProcessingSongs(nextSongs);
      } catch (error) {
        if (requestVersion === requestVersionRef.current && !options?.silent) {
          setError(getApiErrorMessage(error, "Cannot load your song library."));
        }
      } finally {
        if (requestVersion === requestVersionRef.current && !options?.silent) {
          setLoading(false);
        }
      }
    },
    [setLoading],
  );

  const loadMore = useCallback(async () => {
    if (!hasMore || !nextCursor || loadingMoreRef.current) {
      return;
    }

    const requestVersion = requestVersionRef.current;
    loadingMoreRef.current = true;
    setError("");
    setLoadingMore(true);

    try {
      const result = await listMySongs({
        limit: 20,
        cursor: nextCursor,
      });
      if (requestVersion !== requestVersionRef.current) return;

      setSongs((current) => appendUniqueById(current, result.songs));
      const cursor = getSafeNextCursor(result, seenCursorsRef.current);
      setNextCursor(cursor);
      setHasMore(Boolean(cursor));
    } catch (error) {
      if (requestVersion === requestVersionRef.current) {
        setError(getApiErrorMessage(error, "Cannot load more songs."));
      }
    } finally {
      if (requestVersion === requestVersionRef.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [hasMore, nextCursor, setLoadingMore]);

  const removeSong = useCallback(async (songId: string) => {
    setError("");
    setDeletingSongId(songId);

    try {
      await deleteMySong(songId);
      setSongs((current) => current.filter((song) => song.id !== songId));
    } catch (error) {
      setError(
        getApiErrorMessage(error, "Cannot remove this song from your library."),
      );
    } finally {
      setDeletingSongId("");
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadSongs());
  }, [loadSongs, refreshKey]);

  useEffect(() => {
    return subscribeSongLibraryChanged(() => {
      void loadSongs({ silent: true });
    });
  }, [loadSongs]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (!hasProcessingRef.current) {
        return;
      }

      void loadSongs({ silent: true });
    }, POLLING_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [loadSongs]);

  return {
    songs,
    error,
    loading,
    loadingMore,
    deletingSongId,
    hasMore,
    refresh: loadSongs,
    loadMore,
    removeSong,
  };
}

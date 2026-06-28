"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { deleteMySong, listMySongs } from "@/lib/songs/song.api";
import { subscribeSongLibraryChanged } from "@/lib/songs/song-library-events";
import type { SongSummary } from "@/lib/songs/song.types";

const POLLING_INTERVAL_MS = 5000;
const ACTIVE_PROCESSING_STATUSES = new Set([1, 2]);

function hasActiveProcessingSongs(songs: SongSummary[] | undefined) {
  return songs?.some((song) => ACTIVE_PROCESSING_STATUSES.has(song.status)) ?? false;
}

export function useSongLibrary(refreshKey = 0) {
  const [songs, setSongs] = useState<SongSummary[]>([]);
  const [nextCursor, setNextCursor] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deletingSongId, setDeletingSongId] = useState("");
  const [error, setError] = useState("");

  const loadSongs = useCallback(async (options?: { silent?: boolean }) => {
    setError("");

    if (!options?.silent) {
      setLoading(true);
    }

    try {
      const result = await listMySongs({ limit: 20 });

      setSongs(result.songs ?? []);
      setNextCursor(result.nextCursor ?? "");
      setHasMore(Boolean(result.hasMore));
    } catch (error) {
      if (!options?.silent) {
        setError(getApiErrorMessage(error, "Cannot load your song library."));
      }
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMore || !nextCursor || loadingMore) {
      return;
    }

    setError("");
    setLoadingMore(true);

    try {
      const result = await listMySongs({
        limit: 20,
        cursor: nextCursor,
      });

      setSongs((current) => [...current, ...(result.songs ?? [])]);
      setNextCursor(result.nextCursor ?? "");
      setHasMore(Boolean(result.hasMore));
    } catch (error) {
      setError(getApiErrorMessage(error, "Cannot load more songs."));
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, nextCursor]);

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
    void loadSongs();
  }, [loadSongs, refreshKey]);

  useEffect(() => {
    return subscribeSongLibraryChanged(() => {
      void loadSongs({ silent: true });
    });
  }, [loadSongs]);

  useEffect(() => {
    if (!hasActiveProcessingSongs(songs)) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadSongs({ silent: true });
    }, POLLING_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [loadSongs, songs]);

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


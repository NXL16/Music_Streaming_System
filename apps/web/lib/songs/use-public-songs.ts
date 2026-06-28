"use client";

import { useCallback, useEffect, useState } from "react";
import { listPublicSongs } from "@/lib/songs/song.api";
import type { SongSummary } from "@/lib/songs/song.types";

export function usePublicSongs() {
  const [songs, setSongs] = useState<SongSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    listPublicSongs({ limit: 20 })
      .then((result) => {
        if (!cancelled) {
          setSongs(result.songs ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Không thể tải danh sách bài hát.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await listPublicSongs({ limit: 20 });
      setSongs(result.songs ?? []);
    } catch {
      setError("Không thể tải danh sách bài hát.");
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    songs,
    loading,
    error,
    reload,
  };
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { getMySong } from "@/lib/songs/song.api";
import type { SongDetail } from "@/lib/songs/song.types";

export function useSongDetail(songId: string | null) {
  const [song, setSong] = useState<SongDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadSong = useCallback(async () => {
    if (!songId) {
      setSong(null);
      setError("");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await getMySong(songId);
      setSong(result.song);
    } catch (error) {
      setError(getApiErrorMessage(error, "Cannot load song details."));
    } finally {
      setLoading(false);
    }
  }, [songId]);

  useEffect(() => {
    void loadSong();
  }, [loadSong]);

  return {
    song,
    loading,
    error,
    reload: loadSong,
  };
}

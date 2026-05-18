"use client";

import { useCallback, useEffect, useRef } from "react";
import { getStreamData } from "@/lib/api";
import { AudioEngine } from "@/lib/audio/audio-engine";
import { usePlayerStore } from "@/stores/player.store";

export function useAudio() {
  const engineRef = useRef<AudioEngine | null>(null);

  const {
    currentSong,
    streamUrl,
    isPlaying,
    volume,
    setProgress,
    setDuration,
    togglePlay,
  } = usePlayerStore();

  useEffect(() => {
    engineRef.current = new AudioEngine({
      onProgress: setProgress,
      onDuration: setDuration,
      onEnded: () => {
        if (usePlayerStore.getState().isPlaying) {
          togglePlay();
        }
      },
      onError: (error) => {
        console.error("AudioEngine error:", error);
      },
    });

    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, [setProgress, setDuration, togglePlay]);

  useEffect(() => {
    const songId = currentSong?.id;

    if (!songId) {
      engineRef.current?.reset();
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const meta = await getStreamData(songId);

        if (cancelled) return;

        engineRef.current?.setMetadata(songId, meta);
      } catch (error) {
        console.error("Cannot load stream metadata:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentSong?.id]);

  useEffect(() => {
    engineRef.current?.setStreamUrl(streamUrl ?? null);
  }, [streamUrl]);

  useEffect(() => {
    engineRef.current?.setPlaying(isPlaying);
  }, [isPlaying]);

  useEffect(() => {
    engineRef.current?.setVolume(volume);
  }, [volume]);

  const seek = useCallback((percent: number) => {
    engineRef.current?.seek(percent);
  }, []);

  return { seek };
}

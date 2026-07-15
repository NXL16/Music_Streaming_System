"use client";

import { useEffect, useRef } from "react";
import { usePlayerStore } from "./use-player-store";
import { MsePlayer } from "./mse/mse-player";
import { preloadCache } from "./mse/preload-cache";

const MSE_PREFIX = "mse:";

function isMseSong(playbackUrl: string | undefined): boolean {
  return !!playbackUrl?.startsWith(MSE_PREFIX);
}

function extractSongId(playbackUrl: string): string {
  return playbackUrl.slice(MSE_PREFIX.length);
}

export function useMsePlayback(
  audioRef: React.RefObject<HTMLAudioElement | null>,
): { isMseActive: boolean } {
  const currentSong = usePlayerStore((s) => s.currentSong);
  const playing = usePlayerStore((s) => s.playing);
  const queue = usePlayerStore((s) => s.queue);
  const currentIndex = usePlayerStore((s) => s.currentIndex);
  const pause = usePlayerStore((s) => s.pause);
  const playerRef = useRef<MsePlayer | null>(null);
  const activeSongIdRef = useRef<string | null>(null);

  const isMseActive = isMseSong(currentSong?.playbackUrl);

  const playbackUrl = currentSong?.playbackUrl;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !playbackUrl || !isMseSong(playbackUrl)) {
      if (playerRef.current) {
        playerRef.current.detach();
        playerRef.current = null;
        activeSongIdRef.current = null;
      }
      return;
    }

    const songId = extractSongId(playbackUrl);
    if (songId === activeSongIdRef.current) return;

    if (playerRef.current) {
      playerRef.current.detach();
    }

    const player = new MsePlayer();
    playerRef.current = player;
    activeSongIdRef.current = songId;

    const preloaded = preloadCache.get(songId);

    player
      .attach(audio, songId, preloaded)
      .then(() => {
        if (playerRef.current !== player) return;
        if (preloaded) preloadCache.evict(songId);
        if (usePlayerStore.getState().playing) {
          audio.play().catch(() => pause());
        }
      })
      .catch(() => {
        if (playerRef.current === player) pause();
      });

    return () => {
      if (playerRef.current === player) {
        player.detach();
        playerRef.current = null;
        activeSongIdRef.current = null;
      }
    };
  }, [playbackUrl, audioRef, pause]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isMseActive) return;

    if (playing) {
      audio.play().catch(() => pause());
    } else {
      audio.pause();
    }
  }, [playing, isMseActive, audioRef, pause]);

  useEffect(() => {
    if (!isMseActive || currentIndex < 0) return;

    const nextSong = queue[currentIndex + 1];
    if (!nextSong || !isMseSong(nextSong.playbackUrl)) return;

    const nextSongId = extractSongId(nextSong.playbackUrl);
    preloadCache.preload(nextSongId).catch(() => {});
  }, [currentIndex, queue, isMseActive]);

  return { isMseActive };
}

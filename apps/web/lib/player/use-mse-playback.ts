"use client";

import { useEffect, useRef } from "react";
import { usePlayerStore } from "./use-player-store";
import { preloadCache } from "./mse/preload-cache";
import { createMediaPlayer, type MediaPlayer } from "./media-player-factory";

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
  const playerRef = useRef<MediaPlayer | null>(null);
  const activeSongIdRef = useRef<string | null>(null);
  const playerReadyRef = useRef(false);

  const isMseActive = isMseSong(currentSong?.playbackUrl);

  const playbackUrl = currentSong?.playbackUrl;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !playbackUrl || !isMseSong(playbackUrl)) {
      if (playerRef.current) {
        playerRef.current.detach();
        playerRef.current = null;
        activeSongIdRef.current = null;
        playerReadyRef.current = false;
      }
      return;
    }

    const songId = extractSongId(playbackUrl);
    if (songId === activeSongIdRef.current) return;

    if (playerRef.current) {
      playerRef.current.detach();
    }

    const player = createMediaPlayer();
    playerRef.current = player;
    activeSongIdRef.current = songId;
    playerReadyRef.current = false;

    const preloaded = preloadCache.get(songId);

    player
      .attach(audio, songId, preloaded)
      .then(() => {
        if (playerRef.current !== player) return;
        playerReadyRef.current = true;
        if (preloaded) preloadCache.evict(songId);
        if (usePlayerStore.getState().playing) {
          audio.play().catch(() => pause());
        }
      })
      .catch(() => {
        if (playerRef.current === player) {
          player.detach();
          playerRef.current = null;
          activeSongIdRef.current = null;
          playerReadyRef.current = false;
          pause();
        }
      });

    return () => {
      if (playerRef.current === player) {
        player.detach();
        playerRef.current = null;
        activeSongIdRef.current = null;
        playerReadyRef.current = false;
      }
    };
  }, [playbackUrl, audioRef, pause]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isMseActive) return;

    if (playing) {
      // On the first tap, `playing` becomes true before MMS finishes replacing
      // the media element source. Safari aborts a play request made during that
      // replacement (AbortError), so only play after attach has completed.
      if (!playerReadyRef.current) return;

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
    return () => preloadCache.cancelPreload(nextSongId);
  }, [currentIndex, queue, isMseActive]);

  return { isMseActive };
}

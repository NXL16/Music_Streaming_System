"use client";

import Image from "next/image";
import { Play } from "lucide-react";
import { Song, usePlayerStore } from "@/stores/player.store";
import { getStreamUrl } from "@/lib/api";
import { prewarmSongStart } from "@/lib/audio/prewarm-song";
import { useShallow } from "zustand/react/shallow";

type SongCardProps = {
  song: Song;
};

export function SongCard({ song }: SongCardProps) {
  const {
    playSong,
    setStreamUrlForSong,
    currentSong,
    streamUrl,
    isPlaying,
    togglePlay,
  } = usePlayerStore(
    useShallow((state) => ({
      playSong: state.playSong,
      setStreamUrlForSong: state.setStreamUrlForSong,
      currentSong: state.currentSong,
      streamUrl: state.streamUrl,
      isPlaying: state.isPlaying,
      togglePlay: state.togglePlay,
    })),
  );

  const isCurrentSong = currentSong?.id === song.id;

  async function handlePlay() {
    if (isCurrentSong) {
      if (!streamUrl) {
        try {
          const url = await getStreamUrl(song.id);
          setStreamUrlForSong(song.id, url);
        } catch (err) {
          console.error("Failed to retry stream URL:", err);
        }
        return;
      }
      togglePlay();
      return;
    }

    try {
      const url = await getStreamUrl(song.id);
      playSong(song, url);
    } catch (err) {
      console.error("Failed to get stream URL:", err);
    }
  }

  return (
    <div
      className="group relative bg-zinc-800/50 hover:bg-zinc-700/50 rounded-lg p-4 cursor-pointer transition-colors"
      onClick={handlePlay}
      onMouseEnter={() => {
        if (isCurrentSong && streamUrl) return;
        void prewarmSongStart(song.id).catch(() => {
          // Best-effort prefetch; ignore hover failures.
        });
      }}
    >
      {/* Cover */}
      <div className="relative aspect-square mb-3">
        {song.coverUrl ? (
          <Image
            src={song.coverUrl}
            alt={song.title}
            fill
            loading="lazy"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="rounded object-cover"
          />
        ) : (
          <div className="w-full h-full rounded bg-zinc-700" />
        )}

        {/* Play button overlay */}
        <div
          className={`
          absolute bottom-2 right-2 w-10 h-10 bg-green-400 rounded-full
          flex items-center justify-center shadow-lg
          transition-all duration-200
          ${
            isCurrentSong && isPlaying
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0"
          }
        `}
        >
          <Play size={18} className="text-black" fill="black" />
        </div>
      </div>

      {/* Info */}
      <p
        className={`text-sm font-medium truncate ${isCurrentSong ? "text-green-400" : "text-white"}`}
      >
        {song.title}
      </p>
      <p className="text-xs text-zinc-400 truncate mt-1">{song.artist}</p>
    </div>
  );
}

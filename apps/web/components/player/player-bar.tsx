"use client";

import { usePlayerStore } from "@/stores/player.store";
import { PlayerControls } from "./player-controls";
import { ProgressBar } from "./progress-bar";
import Image from "next/image";

export function PlayerBar() {
  const { currentSong } = usePlayerStore();

  if (!currentSong) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 h-20 bg-zinc-900 border-t border-zinc-800 px-4 flex items-center gap-4 z-50">
      {/* Song info */}
      <div className="flex items-center gap-3 w-64 min-w-0">
        <Image
          src={currentSong.coverUrl}
          alt={currentSong.title}
          width={48}
          height={48}
          className="rounded object-cover shrink-0"
        />
        <div className="min-w-0">
          <p className="text-white text-sm font-medium truncate">
            {currentSong.title}
          </p>
          <p className="text-zinc-400 text-xs truncate">{currentSong.artist}</p>
        </div>
      </div>

      {/* Center: controls + progress */}
      <div className="flex-1 flex flex-col items-center gap-1 max-w-xl mx-auto">
        <PlayerControls />
        <ProgressBar />
      </div>

      {/* Right: placeholder cho sau */}
      <div className="w-64" />
    </div>
  );
}

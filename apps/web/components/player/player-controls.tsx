"use client";

import { usePlayerStore } from "@/stores/player.store";
import { useShallow } from "zustand/react/shallow";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
} from "lucide-react";

export function PlayerControls() {
  const { isPlaying, togglePlay } = usePlayerStore(
    useShallow((state) => ({
      isPlaying: state.isPlaying,
      togglePlay: state.togglePlay,
    })),
  );

  return (
    <div className="flex items-center gap-5">
      <button className="text-[#1ed760] transition-colors">
        <Shuffle size={19} />
      </button>

      {/* Skip back */}
      <button className="text-zinc-300 hover:text-white transition-colors">
        <SkipBack size={19} />
      </button>

      {/* Play / Pause */}
      <button
        onClick={togglePlay}
        className="w-9 h-9 bg-white rounded-full flex items-center justify-center hover:scale-105 transition-transform"
      >
        {isPlaying ? (
          <Pause size={19} className="text-black" fill="black" />
        ) : (
          <Play size={19} className="text-black ml-0.5" fill="black" />
        )}
      </button>

      {/* Skip forward */}
      <button className="text-zinc-300 hover:text-white transition-colors">
        <SkipForward size={19} />
      </button>

      <button className="text-zinc-500 hover:text-white transition-colors">
        <Repeat size={19} />
      </button>
    </div>
  );
}

"use client";

import { usePlayerStore } from "@/stores/player.store";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";

export function PlayerControls() {
  const { isPlaying, volume, togglePlay, setVolume } = usePlayerStore();

  return (
    <div className="flex items-center gap-4">
      {/* Skip back */}
      <button className="text-zinc-400 hover:text-white transition-colors">
        <SkipBack size={20} />
      </button>

      {/* Play / Pause */}
      <button
        onClick={togglePlay}
        className="w-9 h-9 bg-white rounded-full flex items-center justify-center hover:scale-105 transition-transform"
      >
        {isPlaying ? (
          <Pause size={18} className="text-black" fill="black" />
        ) : (
          <Play size={18} className="text-black" fill="black" />
        )}
      </button>

      {/* Skip forward */}
      <button className="text-zinc-400 hover:text-white transition-colors">
        <SkipForward size={20} />
      </button>

      {/* Volume */}
      <div className="flex items-center gap-2 ml-4">
        <button
          onClick={() => setVolume(volume === 0 ? 1 : 0)}
          className="text-zinc-400 hover:text-white transition-colors"
        >
          {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="w-20 accent-white"
        />
      </div>
    </div>
  );
}

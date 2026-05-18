"use client";

import { usePlayerStore } from "@/stores/player.store";
import { PlayerControls } from "./player-controls";
import { ProgressBar } from "./progress-bar";
import Image from "next/image";
import { PlusCircle, ListMusic, Mic2, PanelRight, Laptop2, Volume2, VolumeX, Maximize2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

export function PlayerBar() {
  const { currentSong, volume, setVolume } = usePlayerStore(
    useShallow((state) => ({
      currentSong: state.currentSong,
      volume: state.volume,
      setVolume: state.setVolume,
    })),
  );

  if (!currentSong) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 h-24 bg-black border-t border-zinc-900 px-3 flex items-center gap-4 z-50">
      {/* Song info */}
      <div className="flex items-center gap-3 w-[320px] min-w-0">
        {currentSong.coverUrl ? (
          <Image
            src={currentSong.coverUrl}
            alt={currentSong.title}
            width={60}
            height={60}
            className="rounded object-cover shrink-0"
          />
        ) : (
          <div className="w-[60px] h-[60px] rounded bg-zinc-700 shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-white text-[20px] leading-5 font-semibold truncate">
            {currentSong.title}
          </p>
          <p className="text-zinc-400 text-[12px] truncate">{currentSong.artist}</p>
        </div>
        <button className="text-zinc-400 hover:text-white transition-colors ml-1">
          <PlusCircle size={19} />
        </button>
      </div>

      {/* Center: controls + progress */}
      <div className="flex-1 flex flex-col items-center gap-1 max-w-[720px] mx-auto">
        <PlayerControls />
        <ProgressBar />
      </div>

      {/* Right: volume */}
      <div className="w-[360px] flex items-center justify-end gap-3">
        <button className="text-zinc-400 hover:text-white transition-colors">
          <Mic2 size={19} />
        </button>
        <button className="text-zinc-400 hover:text-white transition-colors">
          <ListMusic size={19} />
        </button>
        <button className="text-zinc-400 hover:text-white transition-colors">
          <PanelRight size={19} />
        </button>
        <button className="text-zinc-400 hover:text-white transition-colors">
          <Laptop2 size={19} />
        </button>
        <button
          onClick={() => setVolume(volume === 0 ? 0.6 : 0)}
          className="text-zinc-400 hover:text-white transition-colors"
          aria-label={volume === 0 ? "Unmute" : "Mute"}
        >
          {volume === 0 ? <VolumeX size={19} /> : <Volume2 size={19} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="w-28 h-1 appearance-none rounded-full bg-zinc-600 accent-white"
          aria-label="Volume"
        />
        <button className="text-zinc-400 hover:text-white transition-colors">
          <Maximize2 size={19} />
        </button>
      </div>
    </div>
  );
}

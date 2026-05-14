"use client";

import { usePlayerStore } from "@/stores/player.store";
import { useAudio } from "@/hooks/use-audio";

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ProgressBar() {
  const { progress, duration } = usePlayerStore();
  const { seek } = useAudio();

  const currentTime = (progress / 100) * duration;

  return (
    <div className="flex items-center gap-2 w-full">
      <span className="text-xs text-zinc-400 w-8 text-right">
        {formatTime(currentTime)}
      </span>

      <div
        className="relative flex-1 h-1 bg-zinc-600 rounded-full cursor-pointer group"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const percent = ((e.clientX - rect.left) / rect.width) * 100;
          seek(Math.max(0, Math.min(100, percent)));
        }}
      >
        <div
          className="absolute top-0 left-0 h-full bg-white rounded-full group-hover:bg-green-400 transition-colors"
          style={{ width: `${progress}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `${progress}%`, transform: "translate(-50%, -50%)" }}
        />
      </div>

      <span className="text-xs text-zinc-400 w-8">{formatTime(duration)}</span>
    </div>
  );
}

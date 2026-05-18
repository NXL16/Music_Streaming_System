"use client";

import { useEffect, useRef, useState } from "react";
import { usePlayerStore } from "@/stores/player.store";
import { useAudio } from "@/hooks/use-audio";
import { useShallow } from "zustand/react/shallow";

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ProgressBar() {
  const { progress, duration } = usePlayerStore(
    useShallow((state) => ({
      progress: state.progress,
      duration: state.duration,
    })),
  );
  const { seek } = useAudio();
  const isDraggingRef = useRef(false);
  const barRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const [dragPercent, setDragPercent] = useState<number | null>(null);
  const [keyPreviewPercent, setKeyPreviewPercent] = useState<number | null>(null);

  const visualProgress = dragPercent ?? keyPreviewPercent ?? progress;
  const visualCurrentTime = (visualProgress / 100) * duration;
  const thumbLeft = `clamp(6px, ${visualProgress}%, calc(100% - 6px))`;

  const percentFromClientX = (clientX: number) => {
    const bar = barRef.current;
    if (!bar) return null;
    const rect = bar.getBoundingClientRect();
    const percent = ((clientX - rect.left) / rect.width) * 100;
    return Math.max(0, Math.min(100, percent));
  };

  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if (duration <= 0) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTypingTarget =
        tag === "input" ||
        tag === "textarea" ||
        target?.isContentEditable;
      if (isTypingTarget) return;

      const stepSec = e.shiftKey ? 10 : 5;
      const currentPercent = keyPreviewPercent ?? progress;
      const currentSec = (currentPercent / 100) * duration;
      let nextSec = currentSec;

      if (e.key === "ArrowRight") {
        nextSec = Math.min(duration, currentSec + stepSec);
      } else if (e.key === "ArrowLeft") {
        nextSec = Math.max(0, currentSec - stepSec);
      } else {
        return;
      }

      e.preventDefault();
      setKeyPreviewPercent((nextSec / duration) * 100);
    };

    const onGlobalKeyUp = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (keyPreviewPercent === null) return;
      e.preventDefault();
      seek(keyPreviewPercent);
      setKeyPreviewPercent(null);
    };

    window.addEventListener("keydown", onGlobalKeyDown);
    window.addEventListener("keyup", onGlobalKeyUp);
    return () => {
      window.removeEventListener("keydown", onGlobalKeyDown);
      window.removeEventListener("keyup", onGlobalKeyUp);
    };
  }, [duration, progress, keyPreviewPercent, seek]);

  return (
    <div className="flex items-center gap-2 w-full max-w-[690px]">
      <span className="text-[12px] text-zinc-300 w-9 text-right tabular-nums">
        {formatTime(visualCurrentTime)}
      </span>

      <div
        ref={barRef}
        className="relative flex-1 h-1 bg-zinc-600 rounded-full cursor-pointer group"
        tabIndex={0}
        role="slider"
        aria-label="Playback progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
        onPointerDown={(e) => {
          e.preventDefault();
          isDraggingRef.current = true;
          pointerIdRef.current = e.pointerId;
          const percent = percentFromClientX(e.clientX);
          if (percent !== null) setDragPercent(percent);
          const onMove = (ev: PointerEvent) => {
            if (!isDraggingRef.current) return;
            if (pointerIdRef.current !== null && ev.pointerId !== pointerIdRef.current) return;
            const p = percentFromClientX(ev.clientX);
            if (p !== null) setDragPercent(p);
          };

          const onUp = (ev: PointerEvent) => {
            if (!isDraggingRef.current) return;
            if (pointerIdRef.current !== null && ev.pointerId !== pointerIdRef.current) return;
            const p = percentFromClientX(ev.clientX);
            if (p !== null) seek(p);
            isDraggingRef.current = false;
            pointerIdRef.current = null;
            setDragPercent(null);
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onUp);
          };

          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
          window.addEventListener("pointercancel", onUp);
        }}
        style={{ touchAction: "none" }}
      >
        <div
          className="absolute top-0 left-0 h-full bg-white rounded-full transition-colors"
          style={{ width: `${visualProgress}%` }}
        />
        <div
          className="absolute top-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: thumbLeft, transform: "translate(-50%, -50%)" }}
        />
      </div>

      <span className="text-[12px] text-zinc-300 w-9 tabular-nums">{formatTime(duration)}</span>
    </div>
  );
}

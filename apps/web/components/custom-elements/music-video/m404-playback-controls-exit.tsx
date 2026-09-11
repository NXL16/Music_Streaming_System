"use client";
import { X } from "lucide-react";
import type { ElementType } from "react";
const ExitTag = "amp-playback-controls-exit" as ElementType;
export default function M404PlaybackControlsExit({
  controlsVisible,
  onClose,
  onActivity,
}: {
  controlsVisible: boolean;
  onClose: () => void;
  onActivity: () => void;
}) {
  return (
    <ExitTag
      className={`absolute left-5 top-5 z-20 transition-opacity duration-250 ${controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}
    >
      <button
        type="button"
        onPointerMove={onActivity}
        onClick={onClose}
        className="flex size-11 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-md transition hover:bg-white hover:text-black focus-visible:outline-2 focus-visible:outline-white"
        aria-label="Close video"
      >
        <X className="size-6" strokeWidth={2.25} />
      </button>
    </ExitTag>
  );
}

"use client";

import { useEffect, type ElementType } from "react";
import { usePlayerStore } from "@/lib/player/use-player-store";
import { videoPlaybackController } from "@/lib/player/video-playback-controller";

const KeyboardControlsTag = "m404-video-keyboard-controls" as ElementType;

function shouldIgnoreShortcut(event: KeyboardEvent) {
  if (
    event.defaultPrevented ||
    event.repeat ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  ) {
    return true;
  }

  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;

  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

export default function M404VideoKeyboardControls({
  open,
  onActivity,
}: {
  open: boolean;
  onActivity: () => void;
}) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreShortcut(event)) return;

      // Escape natively exits full screen. Outside that mode it mirrors the
      // visible close control, even when a playback button has focus.
      if (event.code === "Escape") {
        if (document.fullscreenElement) return;

        event.preventDefault();
        onActivity();
        usePlayerStore.getState().setVideoPlayerOpen(false);
        return;
      }

      if (event.code === "KeyF") {
        event.preventDefault();
        onActivity();
        window.dispatchEvent(new Event("musical:toggle-video-fullscreen"));
        return;
      }

      const player = usePlayerStore.getState();
      if (player.currentSong?.playbackKind !== "video") return;

      if (event.code === "Space") {
        event.preventDefault();
        onActivity();

        if (player.playing) {
          videoPlaybackController.pause();
          player.pause();
        } else {
          player.togglePlayback();
          void videoPlaybackController.play().then((started) => {
            if (!started) usePlayerStore.getState().pause();
          });
        }
        return;
      }

      if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
        event.preventDefault();
        onActivity();
        videoPlaybackController.skip(event.code === "ArrowLeft" ? -10 : 10);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onActivity, open]);

  return <KeyboardControlsTag aria-hidden="true" />;
}

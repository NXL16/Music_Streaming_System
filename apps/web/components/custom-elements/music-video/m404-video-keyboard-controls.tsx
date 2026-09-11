"use client";

import { type ElementType, useEffect, useRef } from "react";

const KeyboardControlsTag = "amp-video-keyboard-controls" as ElementType;

type Props = {
  enabled: boolean;
  onActivity: () => void;
  onClose: () => void;
  onFullscreen: () => void;
  onSeek: (seconds: number) => void;
  onToggle: () => void;
};

export default function M404VideoKeyboardControls({
  enabled,
  onActivity,
  onClose,
  onFullscreen,
  onSeek,
  onToggle,
}: Props) {
  const callbacksRef = useRef({
    onActivity,
    onClose,
    onFullscreen,
    onSeek,
    onToggle,
  });

  useEffect(() => {
    callbacksRef.current = {
      onActivity,
      onClose,
      onFullscreen,
      onSeek,
      onToggle,
    };
  }, [onActivity, onClose, onFullscreen, onSeek, onToggle]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        !enabled ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.target instanceof HTMLInputElement
      ) {
        return;
      }

      const callbacks = callbacksRef.current;
      callbacks.onActivity();
      const key = event.key.toLowerCase();
      if (event.key === " " || key === "k") {
        event.preventDefault();
        callbacks.onToggle();
      } else if (event.key === "ArrowLeft" || key === "j") {
        event.preventDefault();
        callbacks.onSeek(-10);
      } else if (event.key === "ArrowRight" || key === "l") {
        event.preventDefault();
        callbacks.onSeek(10);
      } else if (key === "f") {
        event.preventDefault();
        callbacks.onFullscreen();
      } else if (event.key === "Escape") {
        callbacks.onClose();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled]);

  return <KeyboardControlsTag aria-hidden="true" />;
}

"use client";

import {
  ElementType,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import M404VideoKeyboardControls from "./m404-video-keyboard-controls";
import M404PlaybackControlsExit from "./m404-playback-controls-exit";
import VideoPlayInternal from "./m404-video-player-internal";
import { usePlayerStore } from "@/lib/player/use-player-store";

const WindowTakeoverTag = "m404-window-takeover" as ElementType;
const TAKEOVER_TRANSITION_MS = 320;

function getPlaybarMediaRect() {
  const playbarMedia = [
    ...document.querySelectorAll<HTMLElement>(
      '[data-video-playbar-media="true"]',
    ),
  ].find((element) => element.getClientRects().length > 0);

  return playbarMedia?.getBoundingClientRect();
}

export default function WindowTakeover({ open }: { open: boolean }) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(open);
  const hideControlsTimerRef = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);
  const [controlsVisible, setControlsVisible] = useState(true);
  const playing = usePlayerStore((state) => state.playing);
  const shouldAutoHideControls = open && playing;

  const showControls = () => {
    if (!open) return;

    setControlsVisible(true);
    clearTimeout(hideControlsTimerRef.current);
    if (!playing) return;

    hideControlsTimerRef.current = setTimeout(
      () => setControlsVisible(false),
      5_000,
    );
  };

  useEffect(() => {
    clearTimeout(hideControlsTimerRef.current);

    const showControlsTimer = setTimeout(() => setControlsVisible(true), 0);
    if (!shouldAutoHideControls) {
      return () => clearTimeout(showControlsTimer);
    }

    hideControlsTimerRef.current = setTimeout(
      () => setControlsVisible(false),
      5_000,
    );
    return () => {
      clearTimeout(showControlsTimer);
      clearTimeout(hideControlsTimerRef.current);
    };
  }, [shouldAutoHideControls]);

  useEffect(() => () => clearTimeout(hideControlsTimerRef.current), []);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;

    // A video reached through Prev/Next starts in the playbar. Its takeover
    // surface has never been visible, so animating a fictitious full-screen
    // close flashes a large video before it shrinks. Only animate a close
    // after a real open state.
    if (!open && !wasOpen) {
      surface.style.visibility = "hidden";
      surface.style.pointerEvents = "none";
      return;
    }

    const playbarRect = getPlaybarMediaRect();
    if (!playbarRect) return;

    const compactTransform = `translate3d(${playbarRect.left}px, ${playbarRect.top}px, 0) scale3d(${playbarRect.width / window.innerWidth}, ${playbarRect.height / window.innerHeight}, 1)`;
    surface.style.visibility = "visible";
    surface.style.pointerEvents = "auto";

    const animation = surface.animate(
      open
        ? [
            { opacity: 1, transform: compactTransform },
            { opacity: 1, transform: "translate3d(0, 0, 0) scale3d(1, 1, 1)" },
          ]
        : [
            { opacity: 1, transform: "translate3d(0, 0, 0) scale3d(1, 1, 1)" },
            { opacity: 1, transform: compactTransform },
          ],
      {
        duration: TAKEOVER_TRANSITION_MS,
        easing: "cubic-bezier(.22,.61,.36,1)",
        fill: "forwards",
      },
    );

    if (!open) {
      animation.onfinish = () => {
        surface.style.visibility = "hidden";
        surface.style.pointerEvents = "none";
        window.dispatchEvent(new Event("musical:video-takeover-closed"));
      };
    }

    return () => {
      animation.onfinish = null;
      animation.cancel();
    };
  }, [open]);

  return (
    <WindowTakeoverTag role="dialog" aria-modal="true" hydrated="">
      <div ref={surfaceRef} className="container takeover">
        <M404PlaybackControlsExit controlsVisible={controlsVisible} />
        <VideoPlayInternal
          controlsVisible={controlsVisible}
          onActivity={showControls}
        />
      </div>

      <M404VideoKeyboardControls open={open} onActivity={showControls} />
    </WindowTakeoverTag>
  );
}

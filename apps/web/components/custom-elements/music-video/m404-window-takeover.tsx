"use client";

import {
  type ElementType,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { MusicVideoSource } from "./music-video-player";
import M404PlaybackControlsExit from "./m404-playback-controls-exit";
import M404VideoPlayerInternal from "./m404-video-player-internal";

const TakeoverTag = "amp-window-takeover" as ElementType;
const OPEN_VIDEO_TRANSITION_MS = 280;
const CLOSE_VIDEO_TRANSITION_MS = 300;
const PLAYBAR_ARTWORK_BOUNCE_MS = 340;
const PLAYBAR_ARTWORK_BOUNCE_SCALE = 0.9;
const PLAYBAR_ARTWORK_BOUNCE_DELAY_MS = 60;
const PLAYBAR_ARTWORK_SELECTOR = "[data-video-playbar-host='true']";
const PLAYBAR_MEDIA_SELECTOR = "[data-video-playbar-media='true']";

export type VideoTransitionPhase =
  | "closed"
  | "preparing"
  | "opening"
  | "open"
  | "closing";

function usePlaybarArtworkBounce() {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const frameRef = useRef<number | undefined>(undefined);
  const animationRef = useRef<Animation | null>(null);

  const cancel = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    animationRef.current?.cancel();
    timeoutRef.current = undefined;
    frameRef.current = undefined;
    animationRef.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const schedule = useCallback(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    cancel();
    timeoutRef.current = setTimeout(() => {
      frameRef.current = requestAnimationFrame(() => {
        const artworkFrame = document.querySelector<HTMLElement>(
          PLAYBAR_ARTWORK_SELECTOR,
        );
        if (!artworkFrame) return;
        const animation = artworkFrame.animate(
          [
            { transformOrigin: "center", transform: "scale(1)" },
            {
              offset: 0.45,
              transformOrigin: "center",
              transform: `scale(${PLAYBAR_ARTWORK_BOUNCE_SCALE})`,
            },
            {
              offset: 0.76,
              transformOrigin: "center",
              transform: "scale(1.018)",
            },
            { transformOrigin: "center", transform: "scale(1)" },
          ],
          {
            duration: PLAYBAR_ARTWORK_BOUNCE_MS,
            easing: "cubic-bezier(.25,.46,.45,.94)",
          },
        );
        animationRef.current = animation;
        animation.onfinish = () => {
          if (animationRef.current === animation) animationRef.current = null;
          animation.cancel();
        };
      });
    }, PLAYBAR_ARTWORK_BOUNCE_DELAY_MS);
  }, [cancel]);

  return { cancel, schedule };
}

function usePlaybarReady(sourceId: string | undefined) {
  const [isReady, setIsReady] = useState(false);
  useLayoutEffect(() => {
    let frame: number | undefined;
    let observer: MutationObserver | undefined;
    const checkAvailability = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const isAvailable = Boolean(
          sourceId && document.querySelector(PLAYBAR_ARTWORK_SELECTOR),
        );
        setIsReady((previous) =>
          previous === isAvailable ? previous : isAvailable,
        );
        if (isAvailable) observer?.disconnect();
      });
    };
    checkAvailability();
    if (sourceId) {
      observer = new MutationObserver(checkAvailability);
      observer.observe(document.body, { childList: true, subtree: true });
    }
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [sourceId]);
  return isReady;
}

export default function M404WindowTakeover({
  source,
  open,
  onClose,
}: {
  source: MusicVideoSource | null;
  open: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const wasOpenRef = useRef(open);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [phase, setPhase] = useState<VideoTransitionPhase>("closed");
  const sourceId = source?.id;
  const isPlaybarReady = usePlaybarReady(sourceId);
  const {
    cancel: cancelPlaybarArtworkBounce,
    schedule: schedulePlaybarArtworkBounce,
  } = usePlaybarArtworkBounce();
  const presentationOpen =
    phase === "opening" || phase === "open" || phase === "closing";

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    let frame: number | undefined;
    const isNewOpenRequest = open && !wasOpenRef.current;
    wasOpenRef.current = open;
    if (!source || !open) {
      if (phase !== "closed")
        frame = requestAnimationFrame(() => setPhase("closed"));
      return () => {
        if (frame) cancelAnimationFrame(frame);
      };
    }
    if (phase !== "closed") return;
    // A quick reopen must not compete with the small close bounce that may
    // still be composited on the playbar artwork.
    if (isNewOpenRequest) cancelPlaybarArtworkBounce();
    frame = requestAnimationFrame(() => setPhase("preparing"));
    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  }, [cancelPlaybarArtworkBounce, open, phase, source]);

  useEffect(() => {
    if (phase !== "preparing" || !isPlaybarReady) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setPhase("opening"));
    });
    return () => cancelAnimationFrame(frame);
  }, [isPlaybarReady, phase]);

  const requestClose = useCallback(() => {
    if (phase === "open") {
      setPhase("closing");
      return;
    }
    if (phase !== "closing") onClose();
  }, [onClose, phase]);

  const handleTransitionEnd = useCallback(
    (completedPhase: "opening" | "closing") => {
      if (completedPhase === "opening") {
        setPhase("open");
        return;
      }
      setPhase("closed");
      onCloseRef.current();
      schedulePlaybarArtworkBounce();
    },
    [schedulePlaybarArtworkBounce],
  );

  useLayoutEffect(() => {
    if (phase !== "opening" && phase !== "closing") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = requestAnimationFrame(() => handleTransitionEnd(phase));
      return () => cancelAnimationFrame(frame);
    }
    const surface = surfaceRef.current;
    const playbarMedia = document.querySelector<HTMLElement>(
      PLAYBAR_MEDIA_SELECTOR,
    );
    const playbarArtwork = document.querySelector<HTMLElement>(
      PLAYBAR_ARTWORK_SELECTOR,
    );
    if (!surface || !playbarMedia || !playbarArtwork) {
      const frame = requestAnimationFrame(() => handleTransitionEnd(phase));
      return () => cancelAnimationFrame(frame);
    }
    const surfaceRect = surface.getBoundingClientRect();
    const playbarRect = playbarMedia.getBoundingClientRect();
    if (
      !surfaceRect.width ||
      !surfaceRect.height ||
      !playbarRect.width ||
      !playbarRect.height
    ) {
      const frame = requestAnimationFrame(() => handleTransitionEnd(phase));
      return () => cancelAnimationFrame(frame);
    }
    const transform = `translate3d(${playbarRect.left - surfaceRect.left}px, ${playbarRect.top - surfaceRect.top}px, 0) scale3d(${playbarRect.width / surfaceRect.width}, ${playbarRect.height / surfaceRect.height}, 1)`;
    const playbarBorderRadius = getComputedStyle(playbarArtwork).borderRadius;
    const animation = surface.animate(
      phase === "opening"
        ? [
            {
              borderRadius: playbarBorderRadius,
              transformOrigin: "top left",
              transform,
            },
            {
              borderRadius: "0px",
              transformOrigin: "top left",
              transform: "translate3d(0, 0, 0)",
            },
          ]
        : [
            {
              borderRadius: "0px",
              transformOrigin: "top left",
              transform: "translate3d(0, 0, 0)",
            },
            {
              borderRadius: playbarBorderRadius,
              transformOrigin: "top left",
              transform,
            },
          ],
      {
        duration:
          phase === "opening"
            ? OPEN_VIDEO_TRANSITION_MS
            : CLOSE_VIDEO_TRANSITION_MS,
        easing: "cubic-bezier(.22,.61,.36,1)",
        fill: "both",
      },
    );
    animation.onfinish = () => handleTransitionEnd(phase);
    return () => {
      animation.onfinish = null;
      animation.cancel();
    };
  }, [handleTransitionEnd, phase]);

  useEffect(() => {
    if (!sourceId || !presentationOpen) return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const overflow = document.body.style.overflow;
    const focusFirst = () =>
      dialogRef.current
        ?.querySelector<HTMLElement>(
          "button, input, [tabindex]:not([tabindex='-1'])",
        )
        ?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialogRef.current) return;
      const elements = [
        ...dialogRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ),
      ];
      if (!elements.length) return;
      const first = elements[0];
      const last = elements.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.body.style.overflow = "hidden";
    const focusFrame = requestAnimationFrame(focusFirst);
    document.addEventListener("keydown", trapFocus);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", trapFocus);
      returnFocusRef.current?.focus();
    };
  }, [presentationOpen, sourceId]);

  if (!source) return null;
  const isTransitioning = phase !== "closed" && phase !== "open";
  return createPortal(
    <TakeoverTag
      ref={dialogRef}
      role={presentationOpen ? "dialog" : undefined}
      aria-modal={presentationOpen || undefined}
      aria-label={`Music video: ${source.title}`}
      hydrated=""
    >
      <div
        ref={surfaceRef}
        aria-hidden={!presentationOpen}
        className={`fixed inset-0 z-[calc(var(--z-modal)+1)] overflow-hidden text-white backface-hidden contain-[paint] ${isTransitioning ? "transform-gpu will-change-transform" : ""} ${presentationOpen ? "bg-black" : "pointer-events-none"}`}
      >
        {phase === "open" && (
          <M404PlaybackControlsExit
            controlsVisible={controlsVisible}
            onActivity={() => setControlsVisible(true)}
            onClose={requestClose}
          />
        )}

        <M404VideoPlayerInternal
          key={source.id}
          source={source}
          open={presentationOpen}
          previewEnabled={phase === "open"}
          isPlaybarReady={isPlaybarReady}
          onClose={requestClose}
          onControlsChange={setControlsVisible}
        />
      </div>
    </TakeoverTag>,
    document.body,
  );
}

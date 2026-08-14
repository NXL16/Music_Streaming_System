"use client";

import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const MARQUEE_INITIAL_DELAY_MS = 1_600;

type PlayerBarMarqueeProps = {
  children: ReactNode;
  className?: string;
  isPlaybackActive?: boolean;
  onOverflowChange?: (overflows: boolean) => void;
  onAnimatingChange?: (isAnimating: boolean) => void;
};

export function PlayerBarMarquee({
  children,
  className = "",
  isPlaybackActive = true,
  onOverflowChange,
  onAnimatingChange,
}: PlayerBarMarqueeProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const duplicateRef = useRef<HTMLDivElement>(null);

  const overflowRef = useRef<boolean | null>(null);
  const marqueeRequiredRef = useRef(false);
  const playbackActiveRef = useRef(isPlaybackActive);
  const cycleRunningRef = useRef(false);
  const cycleCompletedRef = useRef(false);
  const restartTimeoutRef = useRef<number | null>(null);

  const [contentWidth, setContentWidth] = useState(0);
  const [shouldMarquee, setShouldMarquee] = useState(false);
  const [isCycleRunning, setIsCycleRunning] = useState(false);

  const clearRestartTimeout = useCallback(() => {
    if (restartTimeoutRef.current !== null) {
      window.clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
  }, []);

  const startCycle = useCallback((delayMs = 0) => {
    if (
      !marqueeRequiredRef.current ||
      !playbackActiveRef.current ||
      cycleRunningRef.current ||
      restartTimeoutRef.current !== null
    ) {
      return;
    }

    if (delayMs > 0) {
      restartTimeoutRef.current = window.setTimeout(() => {
        restartTimeoutRef.current = null;
        if (marqueeRequiredRef.current && playbackActiveRef.current) {
          cycleCompletedRef.current = false;
          cycleRunningRef.current = true;
          setIsCycleRunning(true);
        }
      }, delayMs);
    } else {
      cycleCompletedRef.current = false;
      cycleRunningRef.current = true;
      setIsCycleRunning(true);
    }
  }, []);

  const isAnimating = shouldMarquee && isCycleRunning;
  useEffect(() => {
    onAnimatingChange?.(isAnimating);
  }, [isAnimating, onAnimatingChange]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    let disposed = false;
    let frame: number | undefined;

    const measure = () => {
      if (disposed) return;
      if (frame !== undefined) cancelAnimationFrame(frame);

      frame = requestAnimationFrame(() => {
        if (disposed) return;
        frame = undefined;

        const textTarget = content.firstElementChild || content;
        const measuredWidth = textTarget.getBoundingClientRect().width;
        const nextContentWidth = Math.round(measuredWidth * 1000) / 1000;
        const overflows = nextContentWidth > viewport.clientWidth + 0.5;

        marqueeRequiredRef.current = overflows;

        if (overflows) {
          startCycle(MARQUEE_INITIAL_DELAY_MS);
        } else {
          clearRestartTimeout();
          cycleRunningRef.current = false;
          cycleCompletedRef.current = false;
          setIsCycleRunning(false);
        }

        if (overflowRef.current !== overflows) {
          overflowRef.current = overflows;
          onOverflowChange?.(overflows);
        }

        setContentWidth((prev) =>
          prev === nextContentWidth ? prev : nextContentWidth,
        );
        setShouldMarquee((prev) => (prev === overflows ? prev : overflows));
      });
    };

    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(content);
    measure();

    void document.fonts?.ready.then(() => {
      if (!disposed) measure();
    });

    return () => {
      disposed = true;
      observer.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [clearRestartTimeout, onOverflowChange, startCycle]);

  useEffect(() => {
    playbackActiveRef.current = isPlaybackActive;

    if (isPlaybackActive) {
      const timer = window.setTimeout(() => {
        startCycle(MARQUEE_INITIAL_DELAY_MS);
      }, 0);
      return () => {
        window.clearTimeout(timer);
        clearRestartTimeout();
      };
    } else {
      clearRestartTimeout();
    }

    return () => clearRestartTimeout();
  }, [clearRestartTimeout, isPlaybackActive, startCycle]);

  useLayoutEffect(() => {
    const duplicate = duplicateRef.current;
    if (!duplicate || !shouldMarquee) return;

    duplicate
      .querySelectorAll<HTMLElement>(
        "a, button, input, select, textarea, [tabindex]",
      )
      .forEach((element) => {
        element.tabIndex = -1;
      });
  }, [shouldMarquee]);

  const handleAnimationEnd = () => {
    cycleRunningRef.current = false;
    cycleCompletedRef.current = true;
    setIsCycleRunning(false);
  };

  const handleMouseLeave = () => {
    if (!cycleCompletedRef.current) return;
    if (!marqueeRequiredRef.current || !playbackActiveRef.current) return;

    startCycle(0);
  };

  return (
    <div
      ref={viewportRef}
      onMouseLeave={handleMouseLeave}
      className={className}
    >
      <div
        onAnimationEnd={handleAnimationEnd}
        className="[--marquee-scroll-width:calc((var(--marquee-text-content-width)+var(--marquee-line-padding,8px))/1px)] grid grid-cols-[auto_1fr] h-3.75 z-(--z-default) in-[.active.is-animating]:[animation-delay:0s] in-[.active.is-animating]:[animation-duration:calc(var(--marquee-scroll-width)/25*1.25s)] in-[.active.is-animating]:[animation-fill-mode:forwards] in-[.active.is-animating]:[animation-iteration-count:1] in-[.active.is-animating]:[animation-name:marquee] in-[.active.is-animating]:[animation-play-state:running] hover:[animation-play-state:paused] in-[.active.is-animating]:[animation-timing-function:linear] in-[.active.is-animating]:will-change-transform"
        style={
          {
            "--marquee-text-content-width": shouldMarquee
              ? `${contentWidth}px`
              : undefined,
          } as CSSProperties
        }
      >
        <div
          ref={contentRef}
          className="in-[.active]:pe-(--marquee-line-padding,8px)"
        >
          {children}
        </div>

        <div
          ref={duplicateRef}
          aria-hidden="true"
          className="in-[.active]:pe-(--marquee-line-padding,8px) in-[.active.is-animating]:opacity-100 in-[.inactive]:hidden opacity-0"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

type MarqueeTrackState = {
  songId: string | null;
  active: boolean;
  animating: boolean;
};

export function useMarqueeTrackState(currentSongId: string | null) {
  const [state, setState] = useState<MarqueeTrackState>({
    songId: null,
    active: false,
    animating: false,
  });

  const handleOverflowChange = useCallback(
    (active: boolean) => {
      setState({
        songId: currentSongId,
        active,
        animating: false,
      });
    },
    [currentSongId],
  );

  const handleAnimatingChange = useCallback(
    (animating: boolean) => {
      setState((previousState) => ({
        songId: currentSongId,
        active:
          previousState.songId === currentSongId ? previousState.active : false,
        animating,
      }));
    },
    [currentSongId],
  );

  return {
    isActive: state.songId === currentSongId && state.active,
    isAnimating: state.songId === currentSongId && state.animating,
    handleOverflowChange,
    handleAnimatingChange,
  };
}

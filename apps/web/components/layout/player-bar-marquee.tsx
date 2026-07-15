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

const MARQUEE_RESTART_DELAY_MS = 30_000;

type PlayerBarMarqueeProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  isPlaybackActive?: boolean;
  onOverflowChange?: (overflows: boolean) => void;
  trackClassName?: string;
};

export function PlayerBarMarquee({
  children,
  className = "",
  contentClassName = "",
  isPlaybackActive = true,
  onOverflowChange,
  trackClassName = "",
}: PlayerBarMarqueeProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const duplicateRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<boolean | null>(null);
  const marqueeRequiredRef = useRef(false);
  const playbackActiveRef = useRef(isPlaybackActive);
  const cycleRunningRef = useRef(false);
  const restartTimeoutRef = useRef<number | null>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const [shouldMarquee, setShouldMarquee] = useState(false);
  const [isCycleRunning, setIsCycleRunning] = useState(false);
  const [paused, setPaused] = useState(false);

  const clearRestartTimeout = useCallback(() => {
    if (restartTimeoutRef.current === null) return;
    window.clearTimeout(restartTimeoutRef.current);
    restartTimeoutRef.current = null;
  }, []);

  const startCycle = useCallback(() => {
    if (
      !marqueeRequiredRef.current ||
      !playbackActiveRef.current ||
      cycleRunningRef.current ||
      restartTimeoutRef.current !== null
    ) {
      return;
    }

    cycleRunningRef.current = true;
    setIsCycleRunning(true);
  }, []);

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
        const measuredWidth = content.getBoundingClientRect().width;
        const nextContentWidth = Math.round(measuredWidth * 1000) / 1000;
        const contentStyles = window.getComputedStyle(content);
        const horizontalPadding =
          Number.parseFloat(contentStyles.paddingInlineStart) +
          Number.parseFloat(contentStyles.paddingInlineEnd);
        const textWidth = nextContentWidth - horizontalPadding;
        const overflows = textWidth > viewport.clientWidth + 0.5;

        marqueeRequiredRef.current = overflows;
        if (overflows) {
          startCycle();
        } else {
          clearRestartTimeout();
        }

        if (overflowRef.current !== overflows) {
          overflowRef.current = overflows;
          onOverflowChange?.(overflows);
        }
        setContentWidth((current) =>
          current === nextContentWidth ? current : nextContentWidth,
        );
        setShouldMarquee((current) =>
          current === overflows ? current : overflows,
        );
      });
    };

    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(content);
    measure();
    void document.fonts?.ready.then(measure);

    return () => {
      disposed = true;
      observer.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [clearRestartTimeout, onOverflowChange, startCycle]);

  useEffect(() => {
    playbackActiveRef.current = isPlaybackActive;

    if (isPlaybackActive) {
      startCycle();
      return;
    }

    // Do not interrupt a current cycle; only prevent the next one.
    clearRestartTimeout();
  }, [clearRestartTimeout, isPlaybackActive, startCycle]);

  useEffect(
    () => () => {
      clearRestartTimeout();
    },
    [clearRestartTimeout],
  );

  useLayoutEffect(() => {
    const duplicate = duplicateRef.current;
    if (!duplicate) return;

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
    setIsCycleRunning(false);

    if (!marqueeRequiredRef.current || !playbackActiveRef.current) return;

    restartTimeoutRef.current = window.setTimeout(() => {
      restartTimeoutRef.current = null;
      startCycle();
    }, MARQUEE_RESTART_DELAY_MS);
  };

  return (
    <div
      ref={viewportRef}
      className={`overflow-clip whitespace-nowrap ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className={`grid grid-cols-[auto_1fr] h-full z-(--z-default) [--marquee-scroll-width:calc(var(--marquee-text-content-width)/1px)] ${shouldMarquee && isCycleRunning ? "animate-marquee" : ""} ${trackClassName}`}
        onAnimationEnd={handleAnimationEnd}
        style={
          {
            "--marquee-text-content-width": `${contentWidth}px`,
            animationDuration: shouldMarquee && isCycleRunning
              ? `${Math.max(contentWidth / 32, 8)}s`
              : undefined,
            animationIterationCount: isCycleRunning ? 1 : undefined,
            animationPlayState:
              isCycleRunning && paused && isPlaybackActive
                ? "paused"
                : "running",
            willChange: isCycleRunning ? "transform" : undefined,
          } as CSSProperties
        }
      >
        <div
          ref={contentRef}
          className={`pe-(--marquee-line-padding,8px) ${contentClassName}`}
        >
          {children}
        </div>
        {shouldMarquee && (
          <div
            ref={duplicateRef}
            aria-hidden="true"
            className={`pe-(--marquee-line-padding,8px) ${contentClassName}`}
          >
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

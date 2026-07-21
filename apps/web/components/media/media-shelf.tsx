"use client";

import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import MediaCardRenderer from "@/components/media/media-card-renderer";
import type { MediaCardProps } from "@/components/media/media-card.types";

export type MediaShelfDisplayKind =
  | "MusicNotesHeroShelf"
  | "MusicCoverShelf"
  | "MusicCircleCoverShelf"
  | "MusicSocialCardShelf";

export type MediaShelfProps = {
  title: string;
  displayKind: MediaShelfDisplayKind;
  items: MediaCardProps[];
  shelfId?: string;
  prioritizeFirstCard?: boolean;
  /** Reset the horizontal viewport when a newly-prepended item becomes first. */
  scrollToStartKey?: string;
  onSelect?: (shelfId: string) => void;
  /** @deprecated Use shelfId + onSelect instead */
  onTitleClick?: () => void;
  onCardInteraction?: (
    eventType: "impression" | "open" | "play",
    card: MediaCardProps,
    position: number,
  ) => void;
};

const mediaShelfPresets = {
  MusicNotesHeroShelf: {
    "--grid-max-content-xsmall": "200px",
    "--grid-column-gap-xsmall": "10px",
    "--grid-row-gap-xsmall": "24px",
    "--grid-small": "3",
    "--grid-column-gap-small": "20px",
    "--grid-row-gap-small": "24px",
    "--grid-medium": "4",
    "--grid-column-gap-medium": "20px",
    "--grid-row-gap-medium": "24px",
    "--grid-large": "5",
    "--grid-column-gap-large": "20px",
    "--grid-row-gap-large": "24px",
    "--grid-xlarge": "5",
    "--grid-column-gap-xlarge": "20px",
    "--grid-row-gap-xlarge": "24px",
    "--grid-type": "C",
    "--grid-rows": "1",
    "--standard-lockup-shadow-offset": "15px",
  },

  MusicCoverShelf: {
    "--grid-max-content-xsmall": "144px",
    "--grid-column-gap-xsmall": "10px",
    "--grid-row-gap-xsmall": "24px",
    "--grid-small": "4",
    "--grid-column-gap-small": "20px",
    "--grid-row-gap-small": "24px",
    "--grid-medium": "5",
    "--grid-column-gap-medium": "20px",
    "--grid-row-gap-medium": "24px",
    "--grid-large": "6",
    "--grid-column-gap-large": "20px",
    "--grid-row-gap-large": "24px",
    "--grid-xlarge": "6",
    "--grid-column-gap-xlarge": "20px",
    "--grid-row-gap-xlarge": "24px",
    "--grid-type": "G",
    "--grid-rows": "1",
    "--standard-lockup-shadow-offset": "15px",
  },

  MusicCircleCoverShelf: {
    "--grid-max-content-xsmall": "120px",
    "--grid-column-gap-xsmall": "10px",
    "--grid-row-gap-xsmall": "24px",
    "--grid-small": "5",
    "--grid-column-gap-small": "20px",
    "--grid-row-gap-small": "24px",
    "--grid-medium": "6",
    "--grid-column-gap-medium": "20px",
    "--grid-row-gap-medium": "24px",
    "--grid-large": "7",
    "--grid-column-gap-large": "20px",
    "--grid-row-gap-large": "24px",
    "--grid-xlarge": "8",
    "--grid-column-gap-xlarge": "20px",
    "--grid-row-gap-xlarge": "24px",
    "--grid-type": "G",
    "--grid-rows": "1",
    "--standard-lockup-shadow-offset": "15px",
  },

  MusicSocialCardShelf: {
    "--grid-max-content-xsmall": "280px",
    "--grid-column-gap-xsmall": "10px",
    "--grid-row-gap-xsmall": "24px",
    "--grid-small": "2",
    "--grid-column-gap-small": "20px",
    "--grid-row-gap-small": "24px",
    "--grid-medium": "3",
    "--grid-column-gap-medium": "20px",
    "--grid-row-gap-medium": "24px",
    "--grid-large": "3",
    "--grid-column-gap-large": "20px",
    "--grid-row-gap-large": "24px",
    "--grid-xlarge": "4",
    "--grid-column-gap-xlarge": "20px",
    "--grid-row-gap-xlarge": "24px",
    "--grid-type": "G",
    "--grid-rows": "1",
    "--standard-lockup-shadow-offset": "15px",
  },
};

const MOUSE_DRAG_THRESHOLD = 6;
const MOUSE_WHEEL_IDLE_DELAY = 160;
const MOUSE_WHEEL_LINE_HEIGHT = 16;
const DISCRETE_WHEEL_PIXEL_DELTA = 40;
const SHELF_RENDER_AHEAD_ROOT_MARGIN = 96;
const ESTIMATED_SHELF_HEIGHT: Record<MediaShelfDisplayKind, number> = {
  MusicNotesHeroShelf: 320,
  MusicCoverShelf: 250,
  MusicCircleCoverShelf: 225,
  MusicSocialCardShelf: 340,
};
let shelfResizeFrame: number | undefined;
const pendingShelfDraggabilityUpdates = new Set<HTMLUListElement>();

function updateShelfDraggable(shelf: HTMLUListElement) {
  if (
    shelf.dataset.scrollActive === "false" ||
    shelf.dataset.resizeActive === "false"
  ) {
    return;
  }

  shelf.dataset.draggable =
    shelf.scrollWidth > shelf.clientWidth + 1 ? "true" : "false";
}

function queueShelfDraggabilityUpdate(shelf: HTMLUListElement) {
  pendingShelfDraggabilityUpdates.add(shelf);
  if (shelfResizeFrame !== undefined) return;

  shelfResizeFrame = requestAnimationFrame(() => {
    shelfResizeFrame = undefined;
    pendingShelfDraggabilityUpdates.forEach((pendingShelf) => {
      updateShelfDraggable(pendingShelf);
    });
    pendingShelfDraggabilityUpdates.clear();
  });
}

function MediaShelf({
  title,
  displayKind,
  items,
  shelfId,
  prioritizeFirstCard = false,
  scrollToStartKey,
  onSelect,
  onTitleClick,
  onCardInteraction,
}: MediaShelfProps) {
  const isHeroShelf = displayKind === "MusicNotesHeroShelf";
  const shelfContainerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const measuredHeightRef = useRef<number | undefined>(undefined);
  const [measuredHeight, setMeasuredHeight] = useState<number>();
  // Mount only the first discovery shelf (or hero) on the initial paint.
  // Offscreen shelves retain an estimated height until the observer brings
  // them into the render buffer, preventing a 20-shelf Home from creating a
  // large initial card/image/layout burst.
  const [isNearViewport, setIsNearViewport] = useState(
    () => prioritizeFirstCard || isHeroShelf,
  );
  const trackedImpressionsRef = useRef(new Set<string>());

  useEffect(() => {
    const shelf = listRef.current;
    if (!isNearViewport || !onCardInteraction || !shelf) return;

    const record = (position: number) => {
      const card = items[position];
      if (!card) return;

      const key = `${shelfId}:${card.id}`;
      if (trackedImpressionsRef.current.has(key)) return;
      trackedImpressionsRef.current.add(key);
      onCardInteraction("impression", card, position);
    };

    // A rendered horizontal shelf can contain twelve cards while only a few
    // are actually on screen. An impression is meaningful only after the
    // card itself is substantially visible, not merely because its shelf
    // entered the vertical render buffer.
    if (!("IntersectionObserver" in window)) {
      record(0);
      return;
    }

    const cards = Array.from(shelf.children);
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.6) return;
          const position = cards.indexOf(entry.target);
          if (position >= 0) record(position);
        });
      },
      { root: shelf, threshold: 0.6 },
    );

    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [isNearViewport, items, onCardInteraction, shelfId]);

  const handleTitleClick = () => {
    if (onSelect && shelfId) {
      onSelect(shelfId);
    } else if (onTitleClick) {
      onTitleClick();
    }
  };

  const isClickable = Boolean(onSelect || onTitleClick);

  useEffect(() => {
    const shelfContainer = shelfContainerRef.current;
    const scrollContainer = document.querySelector<HTMLElement>(
      "[data-app-scroll-container]",
    );
    if (
      !shelfContainer ||
      !scrollContainer ||
      !("IntersectionObserver" in window)
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Keep the first render intact until ResizeObserver has measured the
        // real shelf height. A virtualized shelf then retains that exact
        // height, so mounting/unmounting cards cannot move the sidebar.
        if (!entry.isIntersecting && measuredHeightRef.current === undefined) {
          return;
        }

        setIsNearViewport((current) =>
          current === entry.isIntersecting ? current : entry.isIntersecting,
        );
      },
      {
        root: scrollContainer,
        rootMargin: `${SHELF_RENDER_AHEAD_ROOT_MARGIN}px 0px`,
      },
    );

    observer.observe(shelfContainer);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const shelfContainer = shelfContainerRef.current;
    if (!shelfContainer || !("ResizeObserver" in window)) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!isNearViewport || entry.contentRect.height <= 0) return;

      const nextHeight = Math.ceil(entry.contentRect.height);
      if (nextHeight === measuredHeightRef.current) return;

      measuredHeightRef.current = nextHeight;
      setMeasuredHeight(nextHeight);
    });

    observer.observe(shelfContainer);
    return () => observer.disconnect();
  }, [isNearViewport]);

  useEffect(() => {
    if (measuredHeight === undefined) return;

    const scrollContainer = document.querySelector<HTMLElement>(
      "[data-app-scroll-container]",
    );
    const shelfContainer = shelfContainerRef.current;
    if (!scrollContainer || !shelfContainer) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const shelfRect = shelfContainer.getBoundingClientRect();
    const isWithinRenderBuffer =
      shelfRect.bottom > containerRect.top - SHELF_RENDER_AHEAD_ROOT_MARGIN &&
      shelfRect.top < containerRect.bottom + SHELF_RENDER_AHEAD_ROOT_MARGIN;

    setIsNearViewport((current) =>
      current === isWithinRenderBuffer ? current : isWithinRenderBuffer,
    );
  }, [isNearViewport, measuredHeight]);

  useEffect(() => {
    const shelf = listRef.current;
    if (!shelf) return;

    // Native scrolling preserves scrollLeft. Keeping shelves active avoids
    // observer-driven writes while the page is scrolling vertically.
    shelf.dataset.scrollActive = "true";
    shelf.dataset.resizeActive = "true";

    return () => {
      delete shelf.dataset.scrollActive;
      delete shelf.dataset.resizeActive;
    };
  }, []);

  useEffect(() => {
    const shelf = listRef.current;
    if (!shelf) return;

    let pendingDelta = 0;
    let wheelFrame: number | undefined;
    let wheelIdleTimer: ReturnType<typeof setTimeout> | undefined;

    const flushWheelScroll = () => {
      wheelFrame = undefined;
      if (pendingDelta === 0) return;

      shelf.scrollLeft += pendingDelta;
      pendingDelta = 0;
    };

    const finishWheelScroll = () => {
      delete shelf.dataset.wheeling;
      wheelIdleTimer = undefined;
    };

    const handleWheel = (event: WheelEvent) => {
      const rawDelta = event.shiftKey ? event.deltaY : event.deltaX;
      // Preserve native small, continuous deltas from a precision touchpad.
      // Some browser/driver pairs report a conventional mouse wheel in pixel
      // mode after a reload, usually as a large discrete delta (for example
      // 100px), so deltaMode alone is not a reliable discriminator.
      const isDiscretePixelDelta =
        Math.abs(rawDelta) >= DISCRETE_WHEEL_PIXEL_DELTA &&
        Number.isInteger(rawDelta);
      const isMouseWheel =
        event.shiftKey ||
        event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL ||
        isDiscretePixelDelta;
      if (
        !isMouseWheel ||
        shelf.dataset.dragging === "true" ||
        shelf.scrollWidth <= shelf.clientWidth + 1
      ) {
        return;
      }

      if (rawDelta === 0) return;

      event.preventDefault();
      const multiplier =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? MOUSE_WHEEL_LINE_HEIGHT
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? shelf.clientWidth
            : 1;
      pendingDelta += rawDelta * multiplier;
      shelf.dataset.wheeling = "true";

      if (wheelFrame === undefined) {
        wheelFrame = requestAnimationFrame(flushWheelScroll);
      }
      if (wheelIdleTimer) clearTimeout(wheelIdleTimer);
      wheelIdleTimer = setTimeout(finishWheelScroll, MOUSE_WHEEL_IDLE_DELAY);
    };

    shelf.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      shelf.removeEventListener("wheel", handleWheel);
      if (wheelFrame !== undefined) cancelAnimationFrame(wheelFrame);
      if (wheelIdleTimer) clearTimeout(wheelIdleTimer);
      delete shelf.dataset.wheeling;
    };
  }, []);

  useEffect(() => {
    if (!scrollToStartKey) return;
    const shelf = listRef.current;
    if (!shelf) return;

    // Recently Played prepends qualified plays. Preserve no previous scroll
    // offset here, otherwise the new first card remains hidden to the left.
    const frame = requestAnimationFrame(() => {
      shelf.scrollLeft = 0;
      queueShelfDraggabilityUpdate(shelf);
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollToStartKey]);

  useEffect(() => {
    const shelf = listRef.current;
    if (!shelf) return;

    queueShelfDraggabilityUpdate(shelf);
    const resizeObserver =
      "ResizeObserver" in window
        ? new ResizeObserver(() => queueShelfDraggabilityUpdate(shelf))
        : undefined;
    resizeObserver?.observe(shelf);

    return () => {
      resizeObserver?.disconnect();
      pendingShelfDraggabilityUpdates.delete(shelf);
      delete shelf.dataset.draggable;
    };
  }, []);

  useEffect(() => {
    const shelf = listRef.current;
    if (!shelf) return;

    updateShelfDraggable(shelf);

    const frame = requestAnimationFrame(() => updateShelfDraggable(shelf));
    return () => cancelAnimationFrame(frame);
  }, [items]);

  useEffect(() => {
    const shelf = listRef.current;
    if (!shelf) return;

    const initialWillChange = shelf.style.willChange;
    let releaseTimer: ReturnType<typeof setTimeout> | undefined;

    const promoteWhileScrolling = () => {
      if (shelf.scrollWidth <= shelf.clientWidth + 1) return;

      shelf.style.willChange = "scroll-position";
      if (releaseTimer) clearTimeout(releaseTimer);
      releaseTimer = setTimeout(() => {
        shelf.style.willChange = initialWillChange;
        releaseTimer = undefined;
      }, 160);
    };

    // Promote only the shelf that is actively moving. Retaining a layer for
    // every shelf on Home would use substantially more GPU memory.
    shelf.addEventListener("scroll", promoteWhileScrolling, { passive: true });

    return () => {
      shelf.removeEventListener("scroll", promoteWhileScrolling);
      if (releaseTimer) clearTimeout(releaseTimer);
      shelf.style.willChange = initialWillChange;
    };
  }, []);

  useEffect(() => {
    const shelf = listRef.current;
    if (!shelf) return;

    let pointerId: number | undefined;
    let startX = 0;
    let startScrollLeft = 0;
    let didDrag = false;
    let suppressClick = false;
    let suppressClickTimer: ReturnType<typeof setTimeout> | undefined;
    let pendingScrollLeft: number | undefined;
    let dragScrollFrame: number | undefined;
    let releaseDragLayerTimer: ReturnType<typeof setTimeout> | undefined;
    let dragLayerActive = false;

    const promoteDragLayer = () => {
      if (dragLayerActive) return;

      dragLayerActive = true;
      shelf.style.willChange = "scroll-position";
    };

    const releaseDragLayer = () => {
      if (releaseDragLayerTimer) clearTimeout(releaseDragLayerTimer);
      releaseDragLayerTimer = setTimeout(() => {
        dragLayerActive = false;
        shelf.style.removeProperty("will-change");
        releaseDragLayerTimer = undefined;
      }, 160);
    };

    const flushDragScroll = () => {
      dragScrollFrame = undefined;
      if (pendingScrollLeft === undefined) return;

      shelf.scrollLeft = pendingScrollLeft;
      pendingScrollLeft = undefined;
    };

    const finishDrag = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;

      const activePointerId = pointerId;
      pointerId = undefined;

      if (didDrag) {
        suppressClick = true;
        if (suppressClickTimer) clearTimeout(suppressClickTimer);
        suppressClickTimer = setTimeout(() => {
          suppressClick = false;
          suppressClickTimer = undefined;
        }, 0);
      }

      didDrag = false;
      delete shelf.dataset.dragging;
      shelf.style.removeProperty("scroll-behavior");

      if (dragScrollFrame !== undefined) {
        cancelAnimationFrame(dragScrollFrame);
        dragScrollFrame = undefined;
      }
      flushDragScroll();

      if (shelf.hasPointerCapture(activePointerId)) {
        shelf.releasePointerCapture(activePointerId);
      }

      releaseDragLayer();
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.pointerType !== "mouse" ||
        event.button !== 0 ||
        shelf.dataset.scrollActive === "false" ||
        shelf.dataset.draggable !== "true"
      ) {
        return;
      }

      pointerId = event.pointerId;
      startX = event.clientX;
      startScrollLeft = shelf.scrollLeft;
      didDrag = false;
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;

      // Pointer events can arrive faster than the display refresh rate. Keep
      // the latest coalesced position and commit only once per paint frame.
      const latestEvent = event.getCoalescedEvents?.().at(-1) ?? event;
      const distance = latestEvent.clientX - startX;
      if (!didDrag && Math.abs(distance) < MOUSE_DRAG_THRESHOLD) return;

      if (!didDrag) {
        didDrag = true;
        shelf.dataset.dragging = "true";
        shelf.style.scrollBehavior = "auto";
        shelf.setPointerCapture(event.pointerId);
        promoteDragLayer();

        // Apply the first dragged position now. Deferring this initial write
        // to the next frame makes a mouse drag feel one frame behind.
        shelf.scrollLeft = startScrollLeft - distance;
        return;
      }

      event.preventDefault();
      pendingScrollLeft = startScrollLeft - distance;
      if (dragScrollFrame === undefined) {
        dragScrollFrame = requestAnimationFrame(flushDragScroll);
      }
    };

    const handleClick = (event: MouseEvent) => {
      if (!suppressClick) return;

      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    };

    const handleNativeDrag = (event: DragEvent) => {
      if (pointerId !== undefined) event.preventDefault();
    };

    shelf.addEventListener("pointerdown", handlePointerDown);
    shelf.addEventListener("pointermove", handlePointerMove);
    shelf.addEventListener("pointerup", finishDrag);
    shelf.addEventListener("pointercancel", finishDrag);
    shelf.addEventListener("click", handleClick, true);
    shelf.addEventListener("dragstart", handleNativeDrag);

    return () => {
      shelf.removeEventListener("pointerdown", handlePointerDown);
      shelf.removeEventListener("pointermove", handlePointerMove);
      shelf.removeEventListener("pointerup", finishDrag);
      shelf.removeEventListener("pointercancel", finishDrag);
      shelf.removeEventListener("click", handleClick, true);
      shelf.removeEventListener("dragstart", handleNativeDrag);

      if (suppressClickTimer) clearTimeout(suppressClickTimer);
      if (dragScrollFrame !== undefined) cancelAnimationFrame(dragScrollFrame);
      if (releaseDragLayerTimer) clearTimeout(releaseDragLayerTimer);
      delete shelf.dataset.dragging;
      shelf.style.removeProperty("scroll-behavior");
      shelf.style.removeProperty("will-change");
    };
  }, []);

  return (
    <div
      ref={shelfContainerRef}
      className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-3"
      style={
        !isNearViewport
          ? {
              minHeight:
                measuredHeight ?? ESTIMATED_SHELF_HEIGHT[displayKind],
            }
          : undefined
      }
    >
      <div>
        <div className="flex items-center justify-end mx-(--bodyGutter) mb-3.25">
          <div className="flex-1">
            <h2 className="inline-block text-(--header-title-color,var(--systemPrimary,#000)) [font:var(--header-title-font,var(--title-2-emphasized))]">
              <button
                className="flex items-center gap-x-1 appearance-none"
                onClick={handleTitleClick}
                type="button"
              >
                <span dir="auto">{title}</span>
                {isClickable && (
                  <svg
                    className="h-(--header-title-chevron-size,12px) fill-(--header-title-chevron-color,var(--dropdownLightGrayIcon))"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 64 64"
                    aria-hidden="true"
                  >
                    <path d="M19.817 61.863c1.48 0 2.672-.515 3.702-1.546l24.243-23.63c1.352-1.385 1.996-2.737 2.028-4.443 0-1.674-.644-3.09-2.028-4.443L23.519 4.138c-1.03-.998-2.253-1.513-3.702-1.513-2.994 0-5.409 2.382-5.409 5.344 0 1.481.612 2.833 1.739 3.96l20.99 20.347-20.99 20.283c-1.127 1.126-1.739 2.478-1.739 3.96 0 2.93 2.415 5.344 5.409 5.344Z"></path>
                  </svg>
                )}
              </button>
            </h2>
          </div>
        </div>

        <div className="pb-8">
          <section
            className="box-border px-(--shelfGridPaddingInline,var(--bodyGutter)) relative w-full z-(--z-default) max-[999px]:ps-(--shelfGridPaddingInline,var(--bodyGutter)) max-[999px]:pe-0"
            style={mediaShelfPresets[displayKind] as CSSProperties}
          >
            <div className="box-content -mx-0.5 overflow-visible px-0.5 w-full">
              <ul
                ref={listRef}
                className={`shelf-grid__list svelte-ranejh ${isHeroShelf ? "shelf-grid__list--align-items-end" : ""}`}
                style={undefined}
              >
                {isNearViewport &&
                  items.map((card, index) => (
                    <MediaCardRenderer
                      key={card.id}
                      {...card}
                      priority={
                        (prioritizeFirstCard || isHeroShelf) && index === 0
                      }
                      onOpen={() => onCardInteraction?.("open", card, index)}
                      onPlay={() => onCardInteraction?.("play", card, index)}
                    />
                  ))}
              </ul>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default memo(MediaShelf);

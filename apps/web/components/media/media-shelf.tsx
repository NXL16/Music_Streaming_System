"use client";

import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
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

const mediaShelfVisibility = {
  MusicNotesHeroShelf: {
    contentVisibility: "auto",
    containIntrinsicSize: "auto 640px",
  },
  MusicCoverShelf: {
    contentVisibility: "auto",
    containIntrinsicSize: "auto 380px",
  },
  MusicCircleCoverShelf: {
    contentVisibility: "auto",
    containIntrinsicSize: "auto 320px",
  },
  MusicSocialCardShelf: {
    contentVisibility: "auto",
    containIntrinsicSize: "auto 200px",
  },
} satisfies Record<MediaShelfDisplayKind, CSSProperties>;

const MOUSE_DRAG_THRESHOLD = 6;
const SHELF_RENDER_AHEAD_ROOT_MARGIN = "1400px 0px";
const SHELF_ARTWORK_PREWARM_ROOT_MARGIN = "0px 0px 1600px";
const SHELF_ARTWORK_PREWARM_ITEM_LIMIT = 6;
const ARTWORK_PREWARM_BATCH_SIZE = 2;
let shelfArtworkPrewarmObserver: IntersectionObserver | undefined;
let shelfResizeFrame: number | undefined;
let artworkPrewarmIdleCallback: number | undefined;
const pendingShelfDraggabilityUpdates = new Set<HTMLUListElement>();
const pendingArtworkPreloads = new Set<string>();
const prewarmedArtworkUrls = new Set<string>();
const shelfArtworkPrewarmListeners = new Map<HTMLUListElement, () => void>();

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

function canPrewarmArtwork() {
  const connection = (
    navigator as Navigator & {
      connection?: { effectiveType?: string; saveData?: boolean };
    }
  ).connection;

  return !(
    connection?.saveData ||
    connection?.effectiveType === "slow-2g" ||
    connection?.effectiveType === "2g"
  );
}

function prewarmShelfArtwork(items: MediaCardProps[]) {
  if (!canPrewarmArtwork()) return;

  items
    .slice(0, SHELF_ARTWORK_PREWARM_ITEM_LIMIT)
    .map((item) => item.imageUrl)
    .filter(Boolean)
    .forEach((url) => {
      if (!prewarmedArtworkUrls.has(url)) {
        pendingArtworkPreloads.add(url);
      }
    });

  scheduleArtworkPrewarm();
}

function flushArtworkPreloads() {
  artworkPrewarmIdleCallback = undefined;
  let prewarmedCount = 0;

  while (
    pendingArtworkPreloads.size > 0 &&
    prewarmedCount < ARTWORK_PREWARM_BATCH_SIZE
  ) {
    const url = pendingArtworkPreloads.values().next().value;
    if (!url) break;

    pendingArtworkPreloads.delete(url);
    prewarmedArtworkUrls.add(url);

    const image = new Image();
    image.decoding = "async";
    image.src = url;
    prewarmedCount += 1;
  }

  if (pendingArtworkPreloads.size > 0) {
    scheduleArtworkPrewarm();
  }
}

function scheduleArtworkPrewarm() {
  if (artworkPrewarmIdleCallback !== undefined) return;

  if (window.requestIdleCallback) {
    artworkPrewarmIdleCallback = window.requestIdleCallback(
      flushArtworkPreloads,
      { timeout: 1_000 },
    );
  } else {
    artworkPrewarmIdleCallback = window.setTimeout(flushArtworkPreloads, 0);
  }
}

function getShelfArtworkPrewarmObserver() {
  if (shelfArtworkPrewarmObserver) return shelfArtworkPrewarmObserver;

  shelfArtworkPrewarmObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        const shelf = entry.target as HTMLUListElement;
        shelfArtworkPrewarmListeners.get(shelf)?.();
        shelfArtworkPrewarmListeners.delete(shelf);
        shelfArtworkPrewarmObserver?.unobserve(shelf);
      });
    },
    {
      root: document.querySelector<HTMLElement>("[data-app-scroll-container]"),
      rootMargin: SHELF_ARTWORK_PREWARM_ROOT_MARGIN,
    },
  );

  return shelfArtworkPrewarmObserver;
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
}: MediaShelfProps) {
  const isHeroShelf = displayKind === "MusicNotesHeroShelf";
  const shelfContainerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);

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
    if (!shelfContainer) return;

    if (!("IntersectionObserver" in window)) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsNearViewport((current) =>
          current === entry.isIntersecting ? current : entry.isIntersecting,
        );
      },
      {
        root: document.querySelector<HTMLElement>(
          "[data-app-scroll-container]",
        ),
        rootMargin: SHELF_RENDER_AHEAD_ROOT_MARGIN,
      },
    );

    observer.observe(shelfContainer);
    return () => observer.disconnect();
  }, []);

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
    if (!shelf || !("IntersectionObserver" in window)) return;

    const artworkPrewarmObserver = getShelfArtworkPrewarmObserver();
    shelfArtworkPrewarmListeners.set(shelf, () => prewarmShelfArtwork(items));
    artworkPrewarmObserver.observe(shelf);

    return () => {
      shelfArtworkPrewarmListeners.delete(shelf);
      artworkPrewarmObserver.unobserve(shelf);
    };
  }, [items]);

  useLayoutEffect(() => {
    const shelf = listRef.current;
    if (!shelf) return;

    updateShelfDraggable(shelf);

    const frame = requestAnimationFrame(() => updateShelfDraggable(shelf));
    return () => cancelAnimationFrame(frame);
  }, [items]);

  useEffect(() => {
    const shelf = listRef.current;
    if (!shelf) return;

    let pointerId: number | undefined;
    let startX = 0;
    let startScrollLeft = 0;
    let didDrag = false;
    let suppressClick = false;
    let suppressClickTimer: ReturnType<typeof setTimeout> | undefined;

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

      if (shelf.hasPointerCapture(activePointerId)) {
        shelf.releasePointerCapture(activePointerId);
      }
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

      // Browser pointer events are already coalesced to the display cadence.
      // Writing here avoids a second requestAnimationFrame of visible latency.
      const latestEvent = event.getCoalescedEvents?.().at(-1) ?? event;
      const distance = latestEvent.clientX - startX;
      if (!didDrag && Math.abs(distance) < MOUSE_DRAG_THRESHOLD) return;

      if (!didDrag) {
        didDrag = true;
        shelf.dataset.dragging = "true";
        shelf.style.scrollBehavior = "auto";
        shelf.setPointerCapture(event.pointerId);
      }

      event.preventDefault();
      shelf.scrollLeft = startScrollLeft - distance;
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
      delete shelf.dataset.dragging;
      shelf.style.removeProperty("scroll-behavior");
    };
  }, []);

  return (
    <div
      ref={shelfContainerRef}
      className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-3"
      style={{
        ...mediaShelfVisibility[displayKind],
        contentVisibility: isNearViewport ? "visible" : "auto",
      }}
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
                {items.map((card, index) => (
                  <MediaCardRenderer
                    key={card.id}
                    {...card}
                    priority={
                      (prioritizeFirstCard || isHeroShelf) && index === 0
                    }
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

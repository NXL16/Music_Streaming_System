"use client";

import { memo, useEffect, useRef, type CSSProperties } from "react";
import MediaCardRenderer from "@/components/media/media-card-renderer";
import type { MediaCardProps } from "@/components/media/media-card.types";

export type MediaShelfDisplayKind =
  | "MusicNotesHeroShelf"
  | "MusicCoverShelf";

export type MediaShelfProps = {
  title: string;
  displayKind: MediaShelfDisplayKind;
  items: MediaCardProps[];
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
    "--shelf-aspect-ratio": "1.00",
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
} satisfies Record<MediaShelfDisplayKind, CSSProperties>;

const shelfObservers = new WeakMap<HTMLElement, IntersectionObserver>();
const MOUSE_DRAG_THRESHOLD = 6;
let shelfResizeObserver: ResizeObserver | undefined;

function updateShelfDraggable(shelf: HTMLUListElement) {
  shelf.dataset.draggable =
    shelf.scrollWidth > shelf.clientWidth + 1 ? "true" : "false";
}

function getShelfResizeObserver() {
  if (shelfResizeObserver) return shelfResizeObserver;

  shelfResizeObserver = new ResizeObserver((entries) => {
    entries.forEach((entry) => {
      updateShelfDraggable(entry.target as HTMLUListElement);
    });
  });

  return shelfResizeObserver;
}

function getShelfObserver(root: HTMLElement) {
  const currentObserver = shelfObservers.get(root);
  if (currentObserver) return currentObserver;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const shelf = entry.target as HTMLUListElement;

        if (!entry.isIntersecting) {
          shelf.dataset.savedScrollLeft = String(shelf.scrollLeft);
          shelf.dataset.scrollActive = "false";
          return;
        }

        shelf.dataset.scrollActive = "true";
        updateShelfDraggable(shelf);

        const savedScrollLeft = Number(shelf.dataset.savedScrollLeft ?? 0);
        if (savedScrollLeft <= 0) return;

        requestAnimationFrame(() => {
          if (
            shelf.isConnected &&
            shelf.dataset.scrollActive === "true"
          ) {
            shelf.scrollLeft = savedScrollLeft;
          }
        });
      });
    },
    {
      root,
      rootMargin: "1000px 0px",
      threshold: 0,
    },
  );

  shelfObservers.set(root, observer);
  return observer;
}

function MediaShelf({
  title,
  displayKind,
  items,
}: MediaShelfProps) {
  const isHeroShelf = displayKind === "MusicNotesHeroShelf";
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const shelf = listRef.current;
    if (!shelf) return;

    const scrollContainer = shelf.closest<HTMLElement>(
      "[data-app-scroll-container]",
    );

    if (!scrollContainer || !("IntersectionObserver" in window)) {
      shelf.dataset.scrollActive = "true";
      return;
    }

    shelf.dataset.scrollActive = "false";
    const observer = getShelfObserver(scrollContainer);
    observer.observe(shelf);

    return () => {
      observer.unobserve(shelf);
      delete shelf.dataset.scrollActive;
      delete shelf.dataset.savedScrollLeft;
    };
  }, []);

  useEffect(() => {
    const shelf = listRef.current;
    if (!shelf) return;

    updateShelfDraggable(shelf);

    const resizeObserver =
      "ResizeObserver" in window ? getShelfResizeObserver() : undefined;
    resizeObserver?.observe(shelf);

    return () => {
      resizeObserver?.unobserve(shelf);
      delete shelf.dataset.draggable;
    };
  }, []);

  useEffect(() => {
    const shelf = listRef.current;
    if (!shelf) return;

    let pointerId: number | undefined;
    let startX = 0;
    let startScrollLeft = 0;
    let targetScrollLeft = 0;
    let scrollFrame: number | undefined;
    let didDrag = false;
    let suppressClick = false;
    let suppressClickTimer: ReturnType<typeof setTimeout> | undefined;

    const flushScroll = () => {
      scrollFrame = undefined;
      shelf.scrollLeft = targetScrollLeft;
    };

    const finishDrag = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;

      const activePointerId = pointerId;
      pointerId = undefined;

      if (scrollFrame !== undefined) {
        cancelAnimationFrame(scrollFrame);
        flushScroll();
      }

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
      targetScrollLeft = startScrollLeft;
      didDrag = false;
      shelf.style.scrollBehavior = "auto";
      shelf.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;

      const distance = event.clientX - startX;
      if (!didDrag && Math.abs(distance) < MOUSE_DRAG_THRESHOLD) return;

      if (!didDrag) {
        didDrag = true;
        shelf.dataset.dragging = "true";
      }

      event.preventDefault();
      targetScrollLeft = startScrollLeft - distance;

      if (scrollFrame === undefined) {
        scrollFrame = requestAnimationFrame(flushScroll);
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
      if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame);
      delete shelf.dataset.dragging;
      shelf.style.removeProperty("scroll-behavior");
    };
  }, []);

  return (
    <div
      className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-3"
      style={mediaShelfVisibility[displayKind]}
    >
      <div>
        <div className="flex items-center justify-end mx-(--bodyGutter) mb-3.25">
          <div className="flex-1">
            <h2 className="inline-block text-(--header-title-color,var(--systemPrimary,#000)) [font:var(--header-title-font,var(--title-2-emphasized))]">
              <span>{title}</span>
            </h2>
          </div>
        </div>

        <div className="pb-8">
          <section
            className="box-border px-(--shelfGridPaddingInline,var(--bodyGutter)) relative w-full z-(--z-default)"
            style={mediaShelfPresets[displayKind] as CSSProperties}
          >
            <div className="box-content -mx-0.5 overflow-visible px-0.5 w-full">
              <ul
                ref={listRef}
                className={`shelf-grid__list svelte-ranejh ${isHeroShelf ? "shelf-grid__list--align-items-end" : ""}`}
              >
                {items.map((card) => (
                  <MediaCardRenderer key={card.id} {...card} />
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

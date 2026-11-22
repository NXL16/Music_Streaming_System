"use client";

const APP_SCROLL_CONTAINER_SELECTOR = "[data-app-scroll-container]";
export const SHELF_RENDER_AHEAD_ROOT_MARGIN = 96;
export const APP_SCROLL_LAYOUT_COMMIT = "app-scroll-layout-commit";
let manualRestorationUsers = 0;
let previousScrollRestoration: ScrollRestoration;

export function holdManualAppScrollRestoration() {
  if (manualRestorationUsers++ === 0) {
    previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
  }
  return () => {
    if (--manualRestorationUsers === 0) {
      window.history.scrollRestoration = previousScrollRestoration;
    }
  };
}

export function getAppScrollContainer(): HTMLElement | null {
  const container = document.querySelector<HTMLElement>(
    APP_SCROLL_CONTAINER_SELECTOR,
  );
  if (!container) return null;

  const { overflowY } = window.getComputedStyle(container);
  return overflowY === "auto" || overflowY === "scroll" ? container : null;
}

export function scrollAppToTop() {
  scrollAppToPosition({ top: 0, left: 0 });
}

export function getAppScrollPosition() {
  const container = getAppScrollContainer();
  return {
    top: container?.scrollTop ?? window.scrollY,
    left: container?.scrollLeft ?? window.scrollX,
  };
}

export function scrollAppToPosition(position: { top: number; left: number }) {
  const container = getAppScrollContainer();
  if (container) {
    container.scrollTo({ ...position, behavior: "auto" });
  } else {
    window.scrollTo({ ...position, behavior: "auto" });
  }
}

export function restoreShelfScrollLeft(shelf: HTMLElement, left: number) {
  shelf.dataset.appScrollLeft = String(left);
  if (
    !shelf.childElementCount ||
    !shelf.getClientRects().length ||
    Math.abs(shelf.scrollLeft - left) <= 1
  )
    return;
  const behavior = shelf.style.scrollBehavior;
  shelf.style.scrollBehavior = "auto";
  shelf.scrollLeft = left;
  shelf.style.scrollBehavior = behavior;
}

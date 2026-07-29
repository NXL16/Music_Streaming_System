"use client";

import { useLayoutEffect } from "react";

const APP_SCROLL_CONTAINER_SELECTOR = "[data-app-scroll-container]";

/** Scrolls the shared app viewport after a new view has committed to the DOM. */
export function useAppScrollToTop(viewKey: string | null | undefined) {
  useLayoutEffect(() => {
    if (!viewKey) return;

    const frame = window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(APP_SCROLL_CONTAINER_SELECTOR)
        ?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [viewKey]);
}

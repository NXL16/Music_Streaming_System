"use client";

import { useLayoutEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  getAppScrollContainer,
  getAppScrollPosition,
  holdManualAppScrollRestoration,
  scrollAppToPosition,
  restoreShelfScrollLeft,
  SHELF_RENDER_AHEAD_ROOT_MARGIN,
  APP_SCROLL_LAYOUT_COMMIT,
} from "./use-app-scroll-to-top";

const ENTRY_KEY = "__appScrollKey";
const ANCHOR_SELECTOR = "[data-app-scroll-anchor]";
const SHELF_SELECTOR = "[data-app-scroll-shelf]";
const STORAGE_KEY = "music:app-scroll-positions:v1";
const MAX_SNAPSHOTS = 200;
const INPUT_EVENTS = ["wheel", "touchstart", "pointerdown", "click", "keydown"];
const initializedDocuments = new WeakSet<Document>();

type Snapshot = ReturnType<typeof getAppScrollPosition> & {
  anchor?: { id: string; offset: number };
  shelves?: Record<string, number>;
};

function sameShelfPositions(
  left?: Record<string, number>,
  right?: Record<string, number>,
) {
  if (left === right) return true;
  if (!left || !right) return false;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => left[key] === right[key])
  );
}

function readSavedSnapshots(): Map<string, Snapshot> {
  try {
    return new Map(
      JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "[]"),
    );
  } catch {
    return new Map();
  }
}

function routeKey(url: string) {
  const parsed = new URL(url, window.location.href);
  const query = parsed.searchParams.toString();
  return parsed.pathname + (query ? `?${query}` : "");
}

function readSnapshot(
  preferredAnchor?: HTMLElement | null,
  previousShelves?: Record<string, number>,
): Snapshot {
  const shelves = { ...previousShelves };
  for (const shelf of document.querySelectorAll<HTMLElement>(SHELF_SELECTOR)) {
    if (shelf.childElementCount && shelf.getClientRects().length)
      shelves[shelf.dataset.appScrollShelf!] = shelf.scrollLeft;
  }
  const position = { ...getAppScrollPosition(), shelves };
  const container = getAppScrollContainer();
  const viewportTop = container?.getBoundingClientRect().top ?? 0;
  const viewportBottom =
    viewportTop + (container?.clientHeight ?? window.innerHeight);
  const anchors = preferredAnchor
    ? [preferredAnchor]
    : document.querySelectorAll<HTMLElement>(ANCHOR_SELECTOR);
  for (const anchor of anchors) {
    const rect = anchor.getBoundingClientRect();
    if (
      rect.height > 0 &&
      rect.bottom > viewportTop &&
      rect.top < viewportBottom
    ) {
      return {
        ...position,
        anchor: {
          id: anchor.dataset.appScrollAnchor!,
          offset: rect.top - viewportTop,
        },
      };
    }
  }
  return position;
}

/** Coordinates URL navigation; same-URL shelf entries remain owned by their hook. */
export function installAppScrollRestoration() {
  const resetOnReload =
    !initializedDocuments.has(document) &&
    (
      window.performance.getEntriesByType("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined
    )?.type === "reload";
  initializedDocuments.add(document);
  const snapshots = readSavedSnapshots();
  const history = window.history;
  const originalPush = history.pushState;
  const originalReplace = history.replaceState;
  const releaseManualRestoration = holdManualAppScrollRestoration();
  let active = true;
  let entry = history.state?.[ENTRY_KEY] as string | undefined;
  let shelfEntry = Boolean(history.state?.__shelfDetail);
  let url = window.location.href;
  let committedRoute = routeKey(url);
  let pending: { snapshot: Snapshot; restoring: boolean } | null = null;
  let departure: Snapshot | null = null;
  let frame: number | undefined;
  let stableFrames = 0;
  let dirty = false;

  const tagEntry = (
    state: Record<string, unknown> | null,
    key = crypto.randomUUID(),
  ) => {
    originalReplace.call(history, { ...state, [ENTRY_KEY]: key }, "");
    return key;
  };
  entry ??= tagEntry(history.state);

  if (resetOnReload) {
    const state = { ...history.state };
    delete state.__shelfDetail;
    tagEntry(state, entry);
    shelfEntry = false;
    snapshots.set(entry, { top: 0, left: 0 });
    dirty = true;
  }

  const persist = () => {
    if (!dirty) return;
    while (snapshots.size > MAX_SNAPSHOTS) {
      snapshots.delete(snapshots.keys().next().value!);
    }
    try {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([...snapshots]),
      );
    } catch {
      // Memory restoration remains available when browser storage is disabled.
    }
    dirty = false;
  };

  const remember = (next: Snapshot) => {
    if (!entry) return;
    const previous = snapshots.get(entry);
    if (
      previous?.top === next.top &&
      previous.left === next.left &&
      previous.anchor?.id === next.anchor?.id &&
      previous.anchor?.offset === next.anchor?.offset &&
      sameShelfPositions(previous.shelves, next.shelves)
    )
      return;
    snapshots.delete(entry);
    snapshots.set(entry, next);
    dirty = true;
  };
  const capture = (preferredAnchor?: HTMLElement | null) =>
    readSnapshot(
      preferredAnchor,
      entry ? snapshots.get(entry)?.shelves : undefined,
    );
  const save = (readDOM = true) =>
    remember(
      departure ??
        pending?.snapshot ??
        (!readDOM && entry ? snapshots.get(entry) : undefined) ??
        capture(),
    );
  const cancel = () => {
    pending = null;
    stableFrames = 0;
    resizeObserver.disconnect();
    mutationObserver.disconnect();
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    frame = undefined;
  };
  const apply = (frameTime?: number) => {
    frame = undefined;
    if (!pending || committedRoute !== routeKey(url)) return;
    const { snapshot } = pending;
    if (
      pending.restoring &&
      Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-app-scroll-ready="false"]',
        ),
      ).some((element) => element.getBoundingClientRect().height > 0)
    )
      return;
    const container = getAppScrollContainer();
    const viewportTop = container?.getBoundingClientRect().top ?? 0;
    const anchor = snapshot.anchor
      ? Array.from(
          document.querySelectorAll<HTMLElement>(ANCHOR_SELECTOR),
        ).find(
          (element) =>
            element.dataset.appScrollAnchor === snapshot.anchor!.id &&
            element.getBoundingClientRect().height > 0,
        )
      : undefined;
    if (
      snapshot.anchor &&
      !anchor &&
      !document.querySelector('[data-app-scroll-ready="true"]')
    )
      return;
    const desiredTop =
      anchor && snapshot.anchor
        ? getAppScrollPosition().top +
          anchor.getBoundingClientRect().top -
          viewportTop -
          snapshot.anchor.offset
        : snapshot.top;
    const scroller = container ?? document.documentElement;
    const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    if (!anchor && maxTop < desiredTop - 1) return;
    const top = Math.max(0, Math.min(desiredTop, maxTop));
    const current = getAppScrollPosition();
    if (Math.abs(current.top - top) > 1 || current.left !== snapshot.left) {
      scrollAppToPosition({ top, left: snapshot.left });
      stableFrames = 0;
    } else if (frameTime !== undefined) {
      stableFrames++;
    }
    if (snapshot.shelves) {
      for (const shelf of document.querySelectorAll<HTMLElement>(
        SHELF_SELECTOR,
      )) {
        if (shelf.getClientRects().length)
          restoreShelfScrollLeft(
            shelf,
            snapshot.shelves[shelf.dataset.appScrollShelf!] ?? 0,
          );
      }
    }
    const viewportBottom =
      viewportTop + (container?.clientHeight ?? window.innerHeight);
    const measuring = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-app-scroll-pending="true"]',
      ),
    ).some((element) => {
      const rect = element.getBoundingClientRect();
      return (
        rect.height > 0 &&
        rect.bottom > viewportTop - SHELF_RENDER_AHEAD_ROOT_MARGIN &&
        rect.top < viewportBottom + SHELF_RENDER_AHEAD_ROOT_MARGIN
      );
    });
    if (pending.restoring && measuring) {
      stableFrames = 0;
      return;
    }
    if (!pending.restoring || stableFrames >= 2) {
      cancel();
      remember({ ...snapshot, ...getAppScrollPosition() });
    } else {
      schedule();
    }
  };
  const schedule = () => {
    if (pending && frame === undefined)
      frame = window.requestAnimationFrame(apply);
  };
  const flush = () => {
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    frame = undefined;
    apply();
  };
  const begin = (snapshot: Snapshot, restoring: boolean) => {
    cancel();
    pending = { snapshot, restoring };
    resizeObserver.observe(content);
    mutationObserver.observe(content, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "hidden",
        "data-app-scroll-ready",
        "data-app-scroll-pending",
      ],
    });
    apply();
  };

  const push: History["pushState"] = function (state, unused, target) {
    if (!active) return originalPush.call(history, state, unused, target);
    const nextUrl =
      target == null ? url : new URL(target, window.location.href).href;
    const changed = routeKey(nextUrl) !== routeKey(url);
    // Next can write history after replacing the departing page's DOM.
    save(!changed);
    persist();
    const key = crypto.randomUUID();
    originalPush.call(history, { ...state, [ENTRY_KEY]: key }, unused, target);
    entry = key;
    departure = null;
    shelfEntry = Boolean(state?.__shelfDetail);
    url = nextUrl;
    if (changed) begin({ top: 0, left: 0 }, false);
    else cancel();
  };
  const replace: History["replaceState"] = function (state, unused, target) {
    if (!active) return originalReplace.call(history, state, unused, target);
    const nextUrl =
      target == null ? url : new URL(target, window.location.href).href;
    const changed = routeKey(nextUrl) !== routeKey(url);
    // Next may synchronously commit a traversal before our popstate listener runs.
    const traversing =
      (routeKey(window.location.href) !== routeKey(url) ||
        (history.state?.[ENTRY_KEY] && history.state[ENTRY_KEY] !== entry)) &&
      routeKey(window.location.href) === routeKey(nextUrl);
    save(!changed && !traversing);
    persist();
    const key = traversing
      ? (state?.[ENTRY_KEY] ??
        history.state?.[ENTRY_KEY] ??
        crypto.randomUUID())
      : changed
        ? crypto.randomUUID()
        : entry;
    originalReplace.call(
      history,
      { ...state, [ENTRY_KEY]: key },
      unused,
      target,
    );
    if (traversing) return;
    entry = key;
    if (changed) departure = null;
    shelfEntry = Boolean(state?.__shelfDetail);
    url = window.location.href;
    if (changed) begin({ top: 0, left: 0 }, false);
  };
  history.pushState = push;
  history.replaceState = replace;

  const onPopState = (event: PopStateEvent) => {
    save(false);
    persist();
    const nextUrl = window.location.href;
    const changed =
      routeKey(nextUrl) !== routeKey(url) ||
      (!shelfEntry && !event.state?.__shelfDetail);
    entry = event.state?.[ENTRY_KEY] ?? tagEntry(event.state);
    departure = null;
    shelfEntry = Boolean(event.state?.__shelfDetail);
    url = nextUrl;
    if (changed) begin(snapshots.get(entry!) ?? { top: 0, left: 0 }, true);
    else cancel();
  };
  const onScroll = (event: Event) => {
    const shelf = event.target as HTMLElement | null;
    const shelfId = shelf?.dataset?.appScrollShelf;
    if (shelfId) {
      if (
        !pending &&
        !departure &&
        window.location.href === url &&
        shelf.childElementCount &&
        shelf.getClientRects().length
      ) {
        const current = entry ? snapshots.get(entry) : undefined;
        const snapshot = current ?? capture();
        remember({
          ...snapshot,
          shelves: { ...snapshot.shelves, [shelfId]: shelf.scrollLeft },
        });
      }
      return;
    }
    if (event.target !== getAppScrollContainer() && event.target !== document)
      return;
    if (!pending && !departure && window.location.href === url) save();
  };
  const onPageHide = () => {
    save(false);
    persist();
  };
  const onUserInput = (event: Event) => {
    if (
      event.type === "keydown" &&
      ![
        "ArrowUp",
        "ArrowDown",
        "PageUp",
        "PageDown",
        "Home",
        "End",
        " ",
        "Tab",
      ].includes((event as KeyboardEvent).key)
    )
      return;
    cancel();
    departure = null;
    save();
    if (event.type !== "click") return;
    const click = event as MouseEvent;
    if (
      click.button !== 0 ||
      click.metaKey ||
      click.ctrlKey ||
      click.shiftKey ||
      click.altKey
    )
      return;
    const target = click.target as Element | null;
    if (target?.closest?.("button, input, select, textarea, [role='button']"))
      return;
    const link = target?.closest?.<HTMLElement>(
      "a[href], [data-app-navigation-href]",
    );
    const href =
      link?.getAttribute("href") ??
      link?.getAttribute("data-app-navigation-href");
    if (!href || link?.hasAttribute("download")) return;
    const targetWindow = link?.getAttribute("target");
    if (targetWindow && targetWindow !== "_self") return;
    const destination = new URL(href, url);
    if (
      destination.origin !== new URL(url).origin ||
      routeKey(destination.href) === routeKey(url)
    )
      return;
    departure = target?.closest?.('[data-app-scroll-return="top"]')
      ? { top: 0, left: 0 }
      : capture(target?.closest?.<HTMLElement>(ANCHOR_SELECTOR));
    save();
    persist();
  };
  const content = document.body;
  const onLayoutChange = () => {
    stableFrames = 0;
    schedule();
  };
  const resizeObserver = new ResizeObserver(onLayoutChange);
  const mutationObserver = new MutationObserver(onLayoutChange);
  window.addEventListener("popstate", onPopState, true);
  window.addEventListener(APP_SCROLL_LAYOUT_COMMIT, flush);
  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("scroll", onScroll, true);
  for (const type of INPUT_EVENTS) {
    document.addEventListener(type, onUserInput, {
      passive: true,
      capture: true,
    });
  }

  const saved = snapshots.get(entry);
  if (resetOnReload) persist();
  if (saved) begin(saved, !resetOnReload);

  return {
    commit(route: string) {
      committedRoute = route;
      flush();
    },
    dispose() {
      save(false);
      persist();
      active = false;
      cancel();
      window.removeEventListener("popstate", onPopState, true);
      window.removeEventListener(APP_SCROLL_LAYOUT_COMMIT, flush);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("scroll", onScroll, true);
      for (const type of INPUT_EVENTS) {
        document.removeEventListener(type, onUserInput, true);
      }
      if (history.pushState === push) history.pushState = originalPush;
      if (history.replaceState === replace)
        history.replaceState = originalReplace;
      releaseManualRestoration();
    },
  };
}

export function AppScrollRestoration() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const controller = useRef<ReturnType<
    typeof installAppScrollRestoration
  > | null>(null);
  useLayoutEffect(() => {
    controller.current = installAppScrollRestoration();
    return () => controller.current?.dispose();
  }, []);
  useLayoutEffect(() => {
    const query = searchParams.toString();
    controller.current?.commit(pathname + (query ? `?${query}` : ""));
  }, [pathname, searchParams]);
  return null;
}

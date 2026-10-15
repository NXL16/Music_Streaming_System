type ScrollStateListener = (isScrolling: boolean) => void;

const SCROLL_IDLE_DELAY_MS = 150;
const APP_SCROLL_CONTAINER_SELECTOR = "[data-app-scroll-container]";

const listeners = new Set<ScrollStateListener>();
let retainCount = 0;
let isScrolling = false;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let isListening = false;
let scrollTarget: Window | HTMLElement | undefined;

function notify() {
  listeners.forEach((listener) => listener(isScrolling));
}

function handleScroll() {
  if (!isScrolling) {
    isScrolling = true;
    notify();
  }

  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = undefined;
    if (!isScrolling) return;
    isScrolling = false;
    notify();
  }, SCROLL_IDLE_DELAY_MS);
}

function startListening() {
  if (isListening) return;
  scrollTarget = window.matchMedia("(max-width: 483px)").matches
    ? window
    : (document.querySelector<HTMLElement>(APP_SCROLL_CONTAINER_SELECTOR) ??
      window);
  scrollTarget.addEventListener("scroll", handleScroll, { passive: true });
  isListening = true;
}

function stopListeningIfUnused() {
  if (!isListening || listeners.size !== 0 || retainCount !== 0) return;

  scrollTarget?.removeEventListener("scroll", handleScroll);
  scrollTarget = undefined;
  isListening = false;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = undefined;
  isScrolling = false;
}

/** A shared scroll signal so ambient cards do not each process every scroll event. */
export function subscribeAmbientScrollState(listener: ScrollStateListener) {
  listeners.add(listener);
  startListening();

  return () => {
    listeners.delete(listener);
    stopListeningIfUnused();
  };
}

/** Keeps scroll state current before an ambient video is mounted. */
export function retainAmbientScrollState() {
  retainCount += 1;
  startListening();

  return () => {
    retainCount -= 1;
    stopListeningIfUnused();
  };
}

export function isAmbientScrollInProgress() {
  return isScrolling;
}

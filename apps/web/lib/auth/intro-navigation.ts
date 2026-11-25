const INTRO_NAVIGATION_TIMEOUT_MS = 4000;

export type IntroDestination = "/login" | "/home";

export function navigateFromIntro(
  href: IntroDestination,
  navigate: (href: IntroDestination) => void,
) {
  let cancelled = false;
  let cancelTransition: (() => void) | undefined;
  let finishReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    finishReady = resolve;
  });
  const destinationVisible = () =>
    window.location.pathname === href &&
    Array.from(
      document.querySelectorAll(
        href === "/home" ? "[data-app-scroll-container]" : "#login-identifier",
      ),
    ).some(
      (element) =>
        element.getClientRects().length > 0 &&
        window.getComputedStyle(element).visibility === "visible",
    );
  const stopWatching = () => {
    window.clearTimeout(timer);
    observer.disconnect();
    finishReady();
  };
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    stopWatching();
    cancelTransition?.();
  };
  const check = () => {
    const path = window.location.pathname;
    if (path !== "/" && path !== href) cancel();
    else if (destinationVisible()) stopWatching();
  };
  const observer = new MutationObserver(check);
  const timer = window.setTimeout(() => {
    const path = window.location.pathname;
    const recover =
      !cancelled && (path === "/" || path === href) && !destinationVisible();
    cancel();
    if (recover) window.location.replace(href);
  }, INTRO_NAVIGATION_TIMEOUT_MS);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "hidden"],
  });
  const go = () => {
    if (cancelled) return;
    try {
      navigate(href);
    } catch {
      cancel();
      window.location.replace(href);
    }
  };
  if (href === "/login") cancelTransition = transitionToLogin(go, ready);
  else go();
  if (cancelled) cancelTransition?.();
  check();
  return cancel;
}

function transitionToLogin(navigate: () => void, ready: Promise<void>) {
  if (
    !document.startViewTransition ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    navigate();
    return;
  }
  const root = document.documentElement;
  root.setAttribute("data-brand-handoff", "");
  let transition: ViewTransition | undefined;
  let finishReady!: () => void;
  const destinationReady = new Promise<void>((resolve) => {
    finishReady = resolve;
  });
  const mountTimer = window.setTimeout(() => {
    transition?.skipTransition();
    finishReady();
  }, 3000);
  void ready.then(() => {
    window.clearTimeout(mountTimer);
    finishReady();
  });
  const cleanup = () => {
    window.clearTimeout(mountTimer);
    window.clearTimeout(animationTimer);
    root.removeAttribute("data-brand-handoff");
    finishReady();
  };
  const animationTimer = window.setTimeout(() => {
    transition?.skipTransition();
    cleanup();
  }, 5000);
  try {
    transition = document.startViewTransition(() => {
      navigate();
      return destinationReady;
    });
    void transition.ready.catch(() => {});
    void transition.finished.then(cleanup, cleanup);
  } catch {
    cleanup();
    navigate();
  }
  return () => {
    transition?.skipTransition();
    cleanup();
  };
}

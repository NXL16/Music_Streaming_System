import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAppScrollContainer,
  getAppScrollPosition,
  holdManualAppScrollRestoration,
  scrollAppToPosition,
  scrollAppToTop,
  restoreShelfScrollLeft,
} from "./use-app-scroll-to-top";

function mockViewport({
  hasContainer = true,
  overflowY = "auto",
  containerTop = 0,
  windowTop = 0,
} = {}) {
  const container = {
    scrollTop: containerTop,
    scrollLeft: 0,
    scrollTo: vi.fn(),
  };
  const windowScrollTo = vi.fn();
  vi.stubGlobal("document", {
    querySelector: vi.fn(() => (hasContainer ? container : null)),
  });
  vi.stubGlobal("window", {
    getComputedStyle: vi.fn(() => ({ overflowY })),
    scrollY: windowTop,
    scrollX: 0,
    scrollTo: windowScrollTo,
  });
  return { container, windowScrollTo };
}

afterEach(() => vi.unstubAllGlobals());

describe("app scroll viewport", () => {
  it("restores shelf offsets immediately without keeping an override of CSS smooth scrolling", () => {
    let left = 0;
    let behaviorDuringWrite = "";
    const shelf = {
      dataset: {} as Record<string, string>,
      style: { scrollBehavior: "smooth" },
      childElementCount: 12,
      getClientRects: () => [{}],
      get scrollLeft() {
        return left;
      },
      set scrollLeft(value: number) {
        behaviorDuringWrite = shelf.style.scrollBehavior;
        left = value;
      },
    };
    restoreShelfScrollLeft(shelf as unknown as HTMLElement, 1200);
    expect(shelf.scrollLeft).toBe(1200);
    expect(shelf.dataset.appScrollLeft).toBe("1200");
    expect(behaviorDuringWrite).toBe("auto");
    expect(shelf.style.scrollBehavior).toBe("smooth");
  });

  it("keeps native restoration disabled until both route and shelf owners release it", () => {
    vi.stubGlobal("window", { history: { scrollRestoration: "auto" } });
    const releaseShelf = holdManualAppScrollRestoration();
    const releaseRoute = holdManualAppScrollRestoration();
    releaseShelf();
    expect(window.history.scrollRestoration).toBe("manual");
    releaseRoute();
    expect(window.history.scrollRestoration).toBe("auto");
  });

  it("reads the scrollable app container's position", () => {
    const { container } = mockViewport({ containerTop: 900 });

    expect(getAppScrollContainer()).toBe(container);
    expect(getAppScrollPosition()).toEqual({ top: 900, left: 0 });
  });

  it("restores and resets the app scroller", () => {
    const { container, windowScrollTo } = mockViewport({ containerTop: 900 });

    scrollAppToPosition({ top: 520, left: 0 });
    scrollAppToTop();

    expect(container.scrollTo.mock.calls).toEqual([
      [{ top: 520, left: 0, behavior: "auto" }],
      [{ top: 0, left: 0, behavior: "auto" }],
    ]);
    expect(windowScrollTo).not.toHaveBeenCalled();
  });

  it("uses document scrolling when no app scroll container exists", () => {
    const { windowScrollTo } = mockViewport({
      hasContainer: false,
      windowTop: 640,
    });

    expect(getAppScrollPosition()).toEqual({ top: 640, left: 0 });
    scrollAppToPosition({ top: 420, left: 0 });
    expect(windowScrollTo).toHaveBeenCalledWith({
      top: 420,
      left: 0,
      behavior: "auto",
    });
  });

  it("ignores an app wrapper whose overflow leaves scrolling to the document", () => {
    const { container, windowScrollTo } = mockViewport({
      overflowY: "visible",
      windowTop: 640,
    });

    expect(getAppScrollPosition()).toEqual({ top: 640, left: 0 });
    scrollAppToTop();
    expect(container.scrollTo).not.toHaveBeenCalled();
    expect(windowScrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  });
});

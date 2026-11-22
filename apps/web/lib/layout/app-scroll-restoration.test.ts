import { afterEach, describe, expect, it, vi } from "vitest";
import { installAppScrollRestoration } from "./app-scroll-restoration";
import { APP_SCROLL_LAYOUT_COMMIT } from "./use-app-scroll-to-top";

let dispose: (() => void) | undefined;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

function setup() {
  let navigationType = "navigate";
  const windowEvents = new EventTarget();
  const documentEvents = new EventTarget();
  const windowAdds = vi.spyOn(windowEvents, "addEventListener");
  const windowRemoves = vi.spyOn(windowEvents, "removeEventListener");
  const documentAdds = vi.spyOn(documentEvents, "addEventListener");
  const documentRemoves = vi.spyOn(documentEvents, "removeEventListener");
  let activeObservers = 0;
  let href = "https://music.test/home";
  const entries = [{ state: { __NA: true } as Record<string, unknown>, href }];
  let index = 0;
  let anchorTop: number | null = null;
  let previousAnchorTop: number | null = null;
  let ready = true;
  let virtualPending = false;
  let shelfRendered = true;
  let layoutChanged = () => {};
  let nextFrame = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const storage = new Map<string, string>();
  const container = {
    scrollTop: 0,
    scrollLeft: 0,
    scrollHeight: 10000,
    clientHeight: 800,
    getBoundingClientRect: () => ({ top: 0 }),
    scrollTo: ({ top, left }: { top: number; left: number }) => {
      container.scrollTop = top;
      container.scrollLeft = left;
    },
  };
  let scrollContainer: typeof container | null = container;
  let windowTop = 0;
  let windowLeft = 0;
  const anchor = {
    dataset: { appScrollAnchor: "shelf-20" },
    getBoundingClientRect: () => ({
      top: anchorTop! - container.scrollTop,
      bottom: anchorTop! - container.scrollTop + 320,
      height: 320,
    }),
  };
  const shelf = {
    dataset: { appScrollShelf: "shelf-20" } as Record<string, string>,
    style: { scrollBehavior: "smooth" },
    scrollLeft: 0,
    get childElementCount() {
      return shelfRendered ? 12 : 0;
    },
    getClientRects: () => (anchorTop === null ? [] : [{}]),
  };
  const previousAnchor = {
    dataset: { appScrollAnchor: "previous-shelf" },
    getBoundingClientRect: () => ({
      top: previousAnchorTop! - container.scrollTop,
      bottom: previousAnchorTop! - container.scrollTop + 320,
      height: 320,
    }),
  };
  const history = {
    scrollRestoration: "auto",
    get state() {
      return entries[index].state;
    },
    pushState(
      state: Record<string, unknown>,
      _unused: string,
      url?: string | URL | null,
    ) {
      href = new URL(url ?? href, href).href;
      entries.splice(++index, entries.length, { state, href });
    },
    replaceState(
      state: Record<string, unknown>,
      _unused: string,
      url?: string | URL | null,
    ) {
      href = new URL(url ?? href, href).href;
      entries[index] = { state, href };
    },
  };
  vi.stubGlobal("window", {
    get scrollY() {
      return windowTop;
    },
    get scrollX() {
      return windowLeft;
    },
    scrollTo: ({ top, left }: { top: number; left: number }) => {
      windowTop = top;
      windowLeft = left;
    },
    performance: { getEntriesByType: () => [{ type: navigationType }] },
    history,
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    location: {
      get href() {
        return href;
      },
    },
    getComputedStyle: () => ({ overflowY: "auto" }),
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
    removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  });
  vi.stubGlobal("document", {
    body: {},
    documentElement: { scrollHeight: 10000, clientHeight: 800 },
    querySelector: (selector: string) =>
      selector.includes("data-app-scroll-ready")
        ? ready
          ? {}
          : null
        : scrollContainer,
    querySelectorAll: (selector: string) =>
      selector.includes("data-app-scroll-shelf")
        ? anchorTop === null
          ? []
          : [shelf]
        : selector.includes("data-app-scroll-pending")
          ? virtualPending
            ? [anchor]
            : []
          : selector.includes("data-app-scroll-ready")
            ? ready
              ? []
              : [{ getBoundingClientRect: () => ({ height: 100 }) }]
            : [
                ...(previousAnchorTop === null ? [] : [previousAnchor]),
                ...(anchorTop === null ? [] : [anchor]),
              ],
    addEventListener: documentEvents.addEventListener.bind(documentEvents),
    removeEventListener:
      documentEvents.removeEventListener.bind(documentEvents),
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      active = false;
      constructor(callback: () => void) {
        layoutChanged = callback;
      }
      observe() {
        if (!this.active) {
          this.active = true;
          activeObservers++;
        }
      }
      disconnect() {
        if (this.active) {
          this.active = false;
          activeObservers--;
        }
      }
    },
  );
  vi.stubGlobal(
    "MutationObserver",
    class {
      active = false;
      observe() {
        if (!this.active) {
          this.active = true;
          activeObservers++;
        }
      }
      disconnect() {
        if (this.active) {
          this.active = false;
          activeObservers--;
        }
      }
    },
  );
  const originalPush = history.pushState;
  const originalReplace = history.replaceState;
  let controller = installAppScrollRestoration();
  dispose = controller.dispose;
  const flush = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(0));
  };
  return {
    resources() {
      return {
        observers: activeObservers,
        frames: frames.size,
        windowListeners:
          windowAdds.mock.calls.length - windowRemoves.mock.calls.length,
        documentListeners:
          documentAdds.mock.calls.length - documentRemoves.mock.calls.length,
        historyRestored:
          history.pushState === originalPush &&
          history.replaceState === originalReplace,
      };
    },
    history,
    container,
    useWindowViewport() {
      scrollContainer = null;
    },
    replaceScrollContainer() {
      const next = {
        ...container,
        scrollTop: 0,
        scrollLeft: 0,
        scrollTo({ top, left }: { top: number; left: number }) {
          this.scrollTop = top;
          this.scrollLeft = left;
        },
      };
      scrollContainer = next;
      return next;
    },
    shelf,
    renderShelf(value: boolean) {
      shelfRendered = value;
    },
    scrollShelf(left: number) {
      shelf.scrollLeft = left;
      const event = new Event("scroll");
      Object.defineProperty(event, "target", { value: shelf });
      documentEvents.dispatchEvent(event);
    },
    controller,
    remount(beforeMount?: () => void) {
      controller.dispose();
      beforeMount?.();
      controller = installAppScrollRestoration();
      dispose = controller.dispose;
    },
    reload() {
      controller.dispose();
      navigationType = "reload";
      vi.stubGlobal("document", { ...document });
      controller = installAppScrollRestoration();
      dispose = controller.dispose;
    },
    flush,
    scroll(top: number) {
      if (scrollContainer) scrollContainer.scrollTop = top;
      else windowTop = top;
      const event = new Event("scroll");
      Object.defineProperty(event, "target", {
        value: scrollContainer ?? document,
      });
      documentEvents.dispatchEvent(event);
    },
    anchor(top: number | null) {
      anchorTop = top;
    },
    previousAnchor(top: number | null) {
      previousAnchorTop = top;
    },
    ready(value: boolean) {
      ready = value;
    },
    measuring(value: boolean) {
      virtualPending = value;
    },
    resize() {
      layoutChanged();
      flush();
    },
    commit() {
      const committed = new URL(href).pathname + new URL(href).search;
      controller.commit(committed);
    },
    contentCommitted() {
      windowEvents.dispatchEvent(new Event(APP_SCROLL_LAYOUT_COMMIT));
    },
    go(delta: number, beforePop?: () => void) {
      index += delta;
      href = entries[index].href;
      const state = history.state;
      beforePop?.();
      const event = new Event("popstate");
      Object.assign(event, { state });
      windowEvents.dispatchEvent(event);
    },
    input() {
      documentEvents.dispatchEvent(new Event("wheel"));
    },
    nestedScroll() {
      documentEvents.dispatchEvent(new Event("scroll"));
    },
    navigateClick({ returnToTop = false, programmatic = false } = {}) {
      const link = {
        getAttribute: (name: string) =>
          name === (programmatic ? "data-app-navigation-href" : "href")
            ? "/album/a"
            : null,
        hasAttribute: () => false,
      };
      const target = {
        closest: (selector: string) =>
          selector.includes("a[href]")
            ? link
            : selector.includes("data-app-scroll-anchor")
              ? anchor
              : selector.includes("data-app-scroll-return") && returnToTop
                ? {}
                : null,
      };
      const event = new Event("click");
      Object.defineProperty(event, "target", { value: target });
      Object.assign(event, { button: 0 });
      documentEvents.dispatchEvent(event);
    },
  };
}

describe("app route scroll restoration", () => {
  it("returns a reordered mobile Recently Searched list to the top without resetting the detail entry", () => {
    const app = setup();
    app.history.replaceState({}, "", "/search");
    app.commit();
    app.scroll(2100);
    app.navigateClick({ returnToTop: true, programmatic: true });
    app.history.pushState({}, "", "/album/a");
    app.commit();
    app.scroll(430);
    app.go(-1);
    app.commit();
    app.flush();
    expect(app.container.scrollTop).toBe(0);
    app.go(1);
    app.commit();
    expect(app.container.scrollTop).toBe(430);
  });

  it.each(["/search", "/search?term=artist"])(
    "keeps normal restoration for an unmarked search list at %s",
    (url) => {
      const app = setup();
      app.history.replaceState({}, "", url);
      app.commit();
      app.scroll(2100);
      app.navigateClick({ programmatic: true });
      app.history.pushState({}, "", "/album/a");
      app.commit();
      app.go(-1);
      app.commit();
      expect(app.container.scrollTop).toBe(2100);
    },
  );
  it("captures a newly mounted app viewport after the public layout", () => {
    const app = setup();
    app.scroll(400);
    const viewport = app.replaceScrollContainer();
    app.scroll(1700);
    app.history.pushState({}, "", "/album/a");
    app.commit();
    app.go(-1);
    app.commit();
    expect(viewport.scrollTop).toBe(1700);
  });

  it("resets reloads and restores Back positions on public pages using window scrolling", () => {
    const app = setup();
    app.useWindowViewport();
    app.history.pushState({}, "", "/login");
    app.commit();
    app.scroll(700);
    app.reload();
    expect(window.scrollY).toBe(0);
    app.scroll(500);
    app.history.pushState({}, "", "/signup");
    app.commit();
    app.go(-1);
    app.commit();
    expect(window.scrollY).toBe(500);
  });

  it.each([
    "/album/a",
    "/playlist/a",
    "/artist/a",
    "/song/a",
    "/search?term=music",
    "/library/artists",
    "/settings",
  ])("resets %s on reload without changing its URL", (path) => {
    const app = setup();
    app.history.pushState({ __NA: true }, "", path);
    app.commit();
    app.scroll(2400);
    app.reload();
    expect(app.container.scrollTop).toBe(0);
    expect(
      new URL(window.location.href).pathname +
        new URL(window.location.href).search,
    ).toBe(path);
    app.scroll(600);
    app.history.pushState({}, "", "/home");
    app.commit();
    app.go(-1);
    app.commit();
    expect(app.container.scrollTop).toBe(600);
  });

  it("closes an expanded shelf on a detail route reload", () => {
    const app = setup();
    app.history.pushState({ __NA: true }, "", "/album/a");
    app.commit();
    app.history.pushState(
      {
        ...app.history.state,
        __shelfDetail: { owner: "catalog-related:a", key: "more-by" },
      },
      "",
    );
    app.scroll(2400);
    app.reload();
    expect(app.container.scrollTop).toBe(0);
    expect(app.history.state.__shelfDetail).toBeUndefined();
  });

  it("starts Home at the top on reload and still restores subsequent Back navigation", () => {
    const app = setup();
    app.anchor(2000);
    app.scroll(2100);
    app.scrollShelf(800);
    app.reload();
    expect(app.container.scrollTop).toBe(0);
    app.scroll(1700);
    app.history.pushState({}, "", "/album/a");
    app.anchor(null);
    app.commit();
    app.go(-1);
    app.anchor(2000);
    app.commit();
    expect(app.container.scrollTop).toBe(1700);
  });

  it("clears the shelf detail marker when reloading its Home URL", () => {
    const app = setup();
    app.scroll(2100);
    app.history.pushState(
      {
        __NA: true,
        tree: "home",
        __shelfDetail: { owner: "home-shelf", key: "albums" },
      },
      "",
    );
    app.scroll(3500);
    app.reload();
    expect(app.container.scrollTop).toBe(0);
    expect(app.history.state.__shelfDetail).toBeUndefined();
    expect(app.history.state).toMatchObject({ __NA: true, tree: "home" });
  });

  it("does not reset a scrolled Home on a later React remount in the reloaded document", () => {
    const app = setup();
    app.reload();
    app.scroll(2100);
    app.remount(() => {
      app.container.scrollTop = 0;
    });
    expect(app.container.scrollTop).toBe(2100);
  });

  it("releases observers, scheduled frames, listeners and history wrappers on disposal", () => {
    const app = setup();
    app.scroll(2400);
    app.history.pushState({}, "", "/album/a");
    app.commit();
    app.go(-1);
    app.commit();
    expect(app.resources().observers).toBe(2);
    expect(app.resources().frames).toBeGreaterThan(0);
    app.controller.dispose();
    dispose = undefined;
    expect(app.resources()).toEqual({
      observers: 0,
      frames: 0,
      windowListeners: 0,
      documentListeners: 0,
      historyRestored: true,
    });
    expect(app.history.scrollRestoration).toBe("auto");
  });

  it("restores Forward's offset in the commit that replaces the album loader", () => {
    const app = setup();
    app.scroll(2400);
    app.history.pushState({}, "", "/album/a");
    app.commit();
    app.scroll(2300);
    app.go(-1);
    app.commit();
    app.ready(false);
    app.go(1);
    app.container.scrollTop = 0;
    app.commit();
    expect(app.container.scrollTop).toBe(0);
    app.ready(true);
    app.contentCommitted();
    expect(app.container.scrollTop).toBe(2300);
  });

  it("does not finish restoration from repeated commits within the same frame", () => {
    const app = setup();
    app.scroll(2400);
    app.history.pushState({}, "", "/album/a");
    app.commit();
    app.scroll(2300);
    app.go(-1);
    app.commit();
    app.go(1);
    app.commit();
    app.contentCommitted();
    app.contentCommitted();
    app.ready(false);
    app.container.scrollTop = 0;
    app.contentCommitted();
    app.ready(true);
    app.contentCommitted();
    expect(app.container.scrollTop).toBe(2300);
  });

  it("restores the horizontal shelf offset together with Home's vertical anchor", () => {
    const app = setup();
    app.anchor(6200);
    app.scroll(6250);
    app.scrollShelf(1600);
    app.navigateClick();
    app.history.pushState({}, "", "/album/a");
    app.anchor(null);
    app.shelf.scrollLeft = 0;
    app.commit();
    app.go(-1);
    app.anchor(5800);
    app.commit();
    expect(app.container.scrollTop).toBe(5850);
    expect(app.shelf.scrollLeft).toBe(1600);
    expect(app.shelf.style.scrollBehavior).toBe("smooth");
  });

  it("keeps horizontal offsets when a virtual shelf temporarily has no cards", () => {
    const app = setup();
    app.anchor(6200);
    app.scroll(6250);
    app.scrollShelf(1600);
    app.renderShelf(false);
    app.scrollShelf(0);
    app.history.pushState({}, "", "/album/a");
    app.anchor(null);
    app.commit();
    app.go(-1);
    app.anchor(5800);
    app.measuring(true);
    app.commit();
    expect(app.shelf.dataset.appScrollLeft).toBe("1600");
    app.renderShelf(true);
    app.measuring(false);
    app.resize();
    expect(app.shelf.scrollLeft).toBe(1600);
  });

  it("waits for nearby virtual shelves to finish measuring before settling", () => {
    const app = setup();
    app.anchor(6200);
    app.scroll(6250);
    app.navigateClick();
    app.history.pushState({}, "", "/album/a");
    app.anchor(null);
    app.commit();
    app.go(-1);
    app.anchor(5800);
    app.measuring(true);
    app.commit();
    app.flush();
    app.flush();
    app.flush();
    app.anchor(5926);
    app.measuring(false);
    app.resize();
    expect(app.container.scrollTop).toBe(5976);
    app.flush();
    app.flush();
    app.container.scrollTop = 4000;
    app.resize();
    expect(app.container.scrollTop).toBe(4000);
  });

  it("stops correcting after the restored layout has settled", () => {
    const app = setup();
    app.anchor(6200);
    app.scroll(6250);
    app.navigateClick();
    app.history.pushState({}, "", "/album/a");
    app.anchor(null);
    app.commit();
    app.go(-1);
    app.anchor(5800);
    app.commit();
    expect(app.container.scrollTop).toBe(5850);
    app.flush();
    app.flush();
    app.container.scrollTop = 4000;
    app.resize();
    expect(app.container.scrollTop).toBe(4000);
  });

  it("waits for loaded content even when a skeleton is tall enough for the saved offset", () => {
    const app = setup();
    app.scroll(500);
    app.history.pushState({}, "", "/album/a");
    app.commit();
    app.ready(false);
    app.go(-1);
    app.commit();
    app.flush();
    app.flush();
    expect(app.container.scrollTop).toBe(0);
    app.ready(true);
    app.resize();
    expect(app.container.scrollTop).toBe(500);
  });

  it("does not let a nested shelf scroll overwrite the page position", () => {
    const app = setup();
    app.scroll(2400);
    app.container.scrollTop = 0;
    app.nestedScroll();
    app.history.pushState({}, "", "/album/a");
    app.commit();
    app.go(-1);
    app.commit();
    expect(app.container.scrollTop).toBe(2400);
  });

  it("keeps the clicked snapshot through an intermediate same-URL router update", () => {
    const app = setup();
    app.anchor(6200);
    app.scroll(6250);
    app.navigateClick();
    app.history.replaceState({ ...app.history.state }, "", "/home");
    app.anchor(null);
    app.scroll(0);
    app.history.pushState({}, "", "/album/a");
    app.commit();
    app.go(-1);
    app.anchor(5800);
    app.commit();
    expect(app.container.scrollTop).toBe(5850);
  });

  it("restores the clicked shelf instead of a partly visible shelf above it", () => {
    const app = setup();
    app.previousAnchor(6000);
    app.anchor(6200);
    app.scroll(6250);
    app.navigateClick();
    app.history.pushState({ __NA: true }, "", "/album/a");
    app.anchor(null);
    app.previousAnchor(null);
    app.commit();
    app.go(-1);
    app.previousAnchor(5100);
    app.anchor(5800);
    app.commit();
    expect(app.container.scrollTop).toBe(5850);
  });

  it("does not replace the clicked position with a layout-induced reset before Next writes history", () => {
    const app = setup();
    app.anchor(6200);
    app.scroll(6250);
    app.navigateClick();
    app.anchor(null);
    app.scroll(0);
    app.history.pushState({ __NA: true }, "", "/album/a");
    app.commit();
    app.go(-1);
    app.anchor(5800);
    app.commit();
    expect(app.container.scrollTop).toBe(5850);
  });

  it("keeps Home's anchor when the controller remounts on the album page", () => {
    const app = setup();
    app.anchor(6200);
    app.scroll(6250);
    app.history.pushState({ __NA: true }, "", "/album/a");
    app.anchor(null);
    app.commit();
    app.scroll(430);
    app.remount();
    app.commit();
    expect(app.container.scrollTop).toBe(430);
    app.go(-1);
    app.anchor(5800);
    app.commit();
    expect(app.container.scrollTop).toBe(5850);
  });

  it("restores after Back happened while a loading boundary had detached the controller", () => {
    const app = setup();
    app.scroll(5100);
    app.history.pushState({ __NA: true }, "", "/album/a");
    app.commit();
    app.remount(() => app.go(-1));
    app.commit();
    expect(app.container.scrollTop).toBe(5100);
  });

  it("preserves the entry when Next replaces history before the popstate listener", () => {
    const app = setup();
    const homeKey = app.history.state.__appScrollKey;
    for (let attempt = 0; attempt < 3; attempt++) {
      app.scroll(6200 + attempt * 100);
      app.history.pushState({ __NA: true }, "", "/album/a");
      app.commit();
      app.go(-1, () => {
        app.history.replaceState(
          { ...app.history.state, __NA: true },
          "",
          "/home",
        );
        app.commit();
      });
      app.flush();
      expect(app.history.state.__appScrollKey).toBe(homeKey);
      expect(app.container.scrollTop).toBe(6200 + attempt * 100);
      app.input();
    }
  });

  it("keeps the departing snapshot when Next writes history after replacing its DOM", () => {
    const app = setup();
    app.anchor(6200);
    app.scroll(6250);
    app.anchor(null);
    app.container.scrollTop = 0;
    app.history.pushState({ __NA: true }, "", "/album/a");
    app.commit();
    app.go(-1);
    app.anchor(5800);
    app.commit();
    expect(app.container.scrollTop).toBe(5850);
  });

  it("resets new routes and restores each entry on Back and Forward", () => {
    const app = setup();
    app.scroll(2400);
    app.history.pushState({ __NA: true, tree: "album" }, "", "/album/a");
    app.commit();
    expect(app.container.scrollTop).toBe(0);
    expect(app.history.state).toMatchObject({ __NA: true, tree: "album" });
    app.scroll(430);
    app.go(-1);
    app.commit();
    expect(app.container.scrollTop).toBe(2400);
    app.go(1);
    app.commit();
    expect(app.container.scrollTop).toBe(430);
  });

  it("waits for Home data and follows its anchor when virtual shelf heights change", () => {
    const app = setup();
    app.anchor(6200);
    app.scroll(6250);
    app.history.pushState({}, "", "/playlist/a");
    app.anchor(null);
    app.commit();
    app.go(-1);
    app.ready(false);
    app.commit();
    expect(app.container.scrollTop).toBe(0);
    app.anchor(5800);
    app.ready(true);
    app.resize();
    expect(app.container.scrollTop).toBe(5850);
    app.anchor(5900);
    app.resize();
    expect(app.container.scrollTop).toBe(5950);
    app.input();
    app.scroll(4000);
    app.resize();
    expect(app.container.scrollTop).toBe(4000);
  });

  it("keeps separate positions for two visits to the same URL", () => {
    const app = setup();
    app.anchor(6200);
    app.scroll(1500);
    app.scrollShelf(300);
    app.history.pushState({}, "", "/album/a");
    app.commit();
    app.history.pushState({}, "", "/home");
    app.commit();
    app.scroll(3700);
    app.scrollShelf(1200);
    app.history.pushState({}, "", "/playlist/a");
    app.commit();
    app.go(-1);
    app.commit();
    expect(app.container.scrollTop).toBe(3700);
    expect(app.shelf.scrollLeft).toBe(1200);
    app.go(-2);
    app.commit();
    expect(app.container.scrollTop).toBe(1500);
    expect(app.shelf.scrollLeft).toBe(300);
  });

  it("leaves same-URL shelf Back and Forward to the shelf history hook", () => {
    const app = setup();
    const homeKey = app.history.state.__appScrollKey;
    app.scroll(3200);
    app.history.pushState(
      { __shelfDetail: { owner: "home", key: "shelf" } },
      "",
    );
    app.flush();
    expect(app.container.scrollTop).toBe(3200);
    app.scroll(500);
    app.go(-1, () => {
      app.history.replaceState({ ...app.history.state }, "", "/home");
    });
    app.flush();
    expect(app.container.scrollTop).toBe(500);
    expect(app.history.state.__appScrollKey).toBe(homeKey);
  });

  it("does not restore into the departing DOM before the route commits", () => {
    const app = setup();
    app.scroll(2200);
    app.history.pushState({}, "", "/album/a");
    app.commit();
    app.scroll(600);
    app.go(-1);
    app.resize();
    expect(app.container.scrollTop).toBe(600);
    app.commit();
    expect(app.container.scrollTop).toBe(2200);
  });

  it("retains the target snapshot when Back is interrupted by Forward", () => {
    const app = setup();
    app.scroll(5100);
    app.history.pushState({}, "", "/album/a");
    app.commit();
    app.scroll(430);
    app.go(-1);
    app.go(1);
    app.commit();
    expect(app.container.scrollTop).toBe(430);
    app.go(-1);
    app.commit();
    expect(app.container.scrollTop).toBe(5100);
  });
});

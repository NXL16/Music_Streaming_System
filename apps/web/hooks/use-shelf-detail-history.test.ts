import { beforeEach, describe, expect, it, vi } from "vitest";

const react = vi.hoisted(() => ({
  useCallback: <T>(callback: T) => callback,
  useEffect: (effect: () => void | (() => void)) => effect(),
  useLayoutEffect: (effect: () => void | (() => void)) => effect(),
  useRef: <T>(value: T) => ({ current: value }),
  useMemo: <T>(factory: () => T) => factory(),
}));

vi.mock("react", () => react);

import { useShelfDetailHistory } from "./use-shelf-detail-history";
import {
  clearShelfDetailHistoryCache,
  getShelfDetailHistoryCache,
} from "./shelf-detail-history-cache";

type HistoryState = Record<string, unknown>;

let state: HistoryState;
let popStateListener: ((event: PopStateEvent) => void) | undefined;
const pushState = vi.fn((nextState: HistoryState) => {
  state = nextState;
});
const back = vi.fn();

beforeEach(() => {
  clearShelfDetailHistoryCache();
  state = {};
  popStateListener = undefined;
  pushState.mockClear();
  back.mockClear();

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      history: {
        get state() {
          return state;
        },
        pushState,
        replaceState: (nextState: HistoryState) => {
          state = nextState;
        },
        back,
      },
      addEventListener: (
        type: string,
        listener: (event: PopStateEvent) => void,
      ) => {
        if (type === "popstate") popStateListener = listener;
      },
      removeEventListener: vi.fn(),
    },
  });
});

function useTestHistory(owner = "test-shelf") {
  const setSelected = vi.fn();
  const history = useShelfDetailHistory({
    owner,
    selected: null as { id: string } | null,
    setSelected,
    getKey: (shelf) => shelf.id,
  });

  return { ...history, setSelected };
}

describe("useShelfDetailHistory", () => {
  it("bounds retained shelf payloads and scroll positions during long sessions", () => {
    const cache = getShelfDetailHistoryCache<string>("long-session");
    for (let i = 0; i < 150; i++) {
      cache.values.set(String(i), `Shelf ${i}`);
      cache.scrollPositions.set(String(i), { top: i * 100, left: 0 });
    }
    expect(cache.values.size).toBe(100);
    expect(cache.scrollPositions.size).toBe(100);
    expect(cache.values.has("0")).toBe(false);
    expect(cache.values.get("149")).toBe("Shelf 149");
    clearShelfDetailHistoryCache();
    expect(cache.values.size).toBe(0);
    expect(cache.scrollPositions.size).toBe(0);
  });

  it("evicts the oldest page owner without retaining its cache globally", () => {
    getShelfDetailHistoryCache<string>("old-page").values.set("shelf", "Old");
    for (let i = 0; i < 50; i++) getShelfDetailHistoryCache(`page-${i}`);
    expect(getShelfDetailHistoryCache("old-page").values.size).toBe(0);
  });
  it("keeps shelves with identical keys isolated between page owners", () => {
    const first = useTestHistory("page-a");
    first.open({ id: "albums" });
    first.update("albums", (shelf) => ({ ...shelf, title: "Page A" }));
    const second = useTestHistory("page-b");
    expect(second.setSelected).toHaveBeenCalledWith(null);
    second.open({ id: "albums" });
    second.update("albums", (shelf) => ({ ...shelf, title: "Page B" }));
    state = { __shelfDetail: { owner: "page-a", key: "albums" } };
    expect(useTestHistory("page-a").setSelected).toHaveBeenCalledWith({
      id: "albums",
      title: "Page A",
    });
  });
  it("restores the full shelf after its page unmounts for an album navigation", () => {
    const firstPage = useTestHistory();
    firstPage.open({ id: "albums" });
    firstPage.update("albums", (shelf) => ({
      ...shelf,
      items: ["a1", "a2"],
      nextCursor: "page2",
    }));

    const returnedPage = useTestHistory();
    expect(returnedPage.setSelected).toHaveBeenCalledWith({
      id: "albums",
      items: ["a1", "a2"],
      nextCursor: "page2",
    });
    expect(pushState).toHaveBeenCalledTimes(1);
  });

  it("does not reopen a cached shelf when returning to the base page entry", () => {
    useTestHistory().open({ id: "albums" });
    state = {};
    expect(useTestHistory().setSelected).toHaveBeenCalledWith(null);
  });

  it("does not restore shelf data after the authenticated session cache is cleared", () => {
    useTestHistory().open({ id: "albums" });
    clearShelfDetailHistoryCache();
    expect(useTestHistory().setSelected).toHaveBeenCalledWith(null);
    expect(state.__shelfDetail).toBeUndefined();
  });

  it("keeps data that finished loading after Back for a later Forward", () => {
    const { open, update, setSelected } = useTestHistory();
    open({ id: "albums" });
    popStateListener?.({ state: {} } as PopStateEvent);
    update("albums", (shelf) => ({ ...shelf, loaded: true }));

    popStateListener?.({
      state: { __shelfDetail: { owner: "test-shelf", key: "albums" } },
    } as PopStateEvent);
    expect(setSelected).toHaveBeenLastCalledWith({
      id: "albums",
      loaded: true,
    });
  });

  it("does not reopen a failed pending detail from stale history", () => {
    const { open, invalidate, setSelected } = useTestHistory();
    open({ id: "albums" });
    popStateListener?.({ state: {} } as PopStateEvent);
    invalidate("albums");
    popStateListener?.({
      state: { __shelfDetail: { owner: "test-shelf", key: "albums" } },
    } as PopStateEvent);
    expect(setSelected).toHaveBeenLastCalledWith(null);
  });

  it("identifies stale requests after a different shelf has opened", () => {
    const { open, isCurrent } = useTestHistory();

    open({ id: "albums" });
    expect(isCurrent("albums")).toBe(true);

    open({ id: "artists" });
    expect(isCurrent("albums")).toBe(false);
    expect(isCurrent("artists")).toBe(true);
  });

  it("does not create duplicate entries for repeated opens of the same shelf", () => {
    const { open } = useTestHistory();

    open({ id: "albums" });
    open({ id: "albums" });

    expect(pushState).toHaveBeenCalledTimes(1);
  });

  it("prevents repeated close actions until the browser finishes navigation", () => {
    const { close, open } = useTestHistory();
    open({ id: "albums" });

    close();
    close();

    expect(back).toHaveBeenCalledTimes(1);

    state = {};
    popStateListener?.({ state } as PopStateEvent);
    close();

    expect(back).toHaveBeenCalledTimes(1);
  });

  it("restores the cached shelf when browser Forward returns to its history entry", () => {
    const { open, setSelected } = useTestHistory();
    const shelf = { id: "albums" };
    open(shelf);
    setSelected.mockClear();

    popStateListener?.({
      state: { __shelfDetail: { owner: "test-shelf", key: "albums" } },
    } as PopStateEvent);

    expect(setSelected).toHaveBeenCalledWith(shelf);
  });
});

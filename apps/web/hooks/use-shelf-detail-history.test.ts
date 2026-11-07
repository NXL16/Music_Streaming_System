import { beforeEach, describe, expect, it, vi } from "vitest";

const react = vi.hoisted(() => ({
  useCallback: <T>(callback: T) => callback,
  useEffect: (effect: () => void | (() => void)) => effect(),
  useRef: <T>(value: T) => ({ current: value }),
}));

vi.mock("react", () => react);

import { useShelfDetailHistory } from "./use-shelf-detail-history";

type HistoryState = Record<string, unknown>;

let state: HistoryState;
let popStateListener: ((event: PopStateEvent) => void) | undefined;
const pushState = vi.fn((nextState: HistoryState) => {
  state = nextState;
});
const back = vi.fn();

beforeEach(() => {
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

function useTestHistory() {
  const setSelected = vi.fn();
  const history = useShelfDetailHistory({
    owner: "test-shelf",
    selected: null as { id: string } | null,
    setSelected,
    getKey: (shelf) => shelf.id,
  });

  return { ...history, setSelected };
}

describe("useShelfDetailHistory", () => {
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

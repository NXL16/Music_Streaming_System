type ScrollPosition = { top: number; left: number };

const MAX_HISTORY_ENTRIES = 100;

class HistoryMap<T> extends Map<string, T> {
  override set(key: string, value: T) {
    this.delete(key);
    super.set(key, value);
    while (this.size > MAX_HISTORY_ENTRIES) {
      this.delete(this.keys().next().value!);
    }
    return this;
  }
}

type ShelfHistoryCache<T> = {
  values: Map<string, T>;
  scrollPositions: Map<string, ScrollPosition>;
};

const MAX_HISTORY_OWNERS = 50;
const histories = new Map<string, ShelfHistoryCache<unknown>>();

export function getShelfDetailHistoryCache<T>(
  owner: string,
): ShelfHistoryCache<T> {
  const cached = histories.get(owner) ?? {
    values: new HistoryMap<unknown>(),
    scrollPositions: new HistoryMap<ScrollPosition>(),
  };
  histories.delete(owner);
  histories.set(owner, cached);
  while (histories.size > MAX_HISTORY_OWNERS) {
    histories.delete(histories.keys().next().value!);
  }
  return cached as ShelfHistoryCache<T>;
}

export function clearShelfDetailHistoryCache() {
  for (const history of histories.values()) {
    history.values.clear();
    history.scrollPositions.clear();
  }
  histories.clear();
}

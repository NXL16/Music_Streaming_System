export const FAVORITES_CHANGED_EVENT = "favorites:changed";
const FAVORITES_SYNC_CHANNEL = "favorite-changes";

export type FavoriteChange = {
  songId: string;
  isFavorite: boolean;
  remote: boolean;
};

const favoritesSyncChannel =
  typeof window !== "undefined" && "BroadcastChannel" in window
    ? new BroadcastChannel(FAVORITES_SYNC_CHANNEL)
    : null;

function dispatchFavoriteChange(
  change: Omit<FavoriteChange, "remote">,
  remote: boolean,
) {
  window.dispatchEvent(
    new CustomEvent<FavoriteChange>(FAVORITES_CHANGED_EVENT, {
      detail: { ...change, remote },
    }),
  );
}

if (favoritesSyncChannel) {
  favoritesSyncChannel.onmessage = (
    event: MessageEvent<Omit<FavoriteChange, "remote">>,
  ) => {
    const change = event.data;
    if (!change?.songId || typeof change.isFavorite !== "boolean") return;
    dispatchFavoriteChange(change, true);
  };
}

/** Broadcasts a completed favorite mutation; remote tabs rehydrate from API. */
export function notifyFavoriteChanged(songId: string, isFavorite: boolean) {
  const change = { songId, isFavorite };
  dispatchFavoriteChange(change, false);
  favoritesSyncChannel?.postMessage(change);
}

export function subscribeFavoriteChanges(
  listener: (change: FavoriteChange) => void,
) {
  const handleChange = (event: Event) => {
    const change = (event as CustomEvent<FavoriteChange>).detail;
    if (change?.songId) listener(change);
  };
  window.addEventListener(FAVORITES_CHANGED_EVENT, handleChange);
  return () =>
    window.removeEventListener(FAVORITES_CHANGED_EVENT, handleChange);
}

export const PLAYLIST_FAVORITE_CHANGED_EVENT = "playlist-favorite-changed";

export type PlaylistFavoriteChangedDetail = {
  playlistId: string;
  isFavorite: boolean;
};

const PLAYLIST_FAVORITE_SYNC_CHANNEL = "playlist-favorite-changes";

const playlistFavoriteSyncChannel =
  typeof window !== "undefined" && "BroadcastChannel" in window
    ? new BroadcastChannel(PLAYLIST_FAVORITE_SYNC_CHANNEL)
    : null;

function dispatchPlaylistFavoriteChanged(
  detail: PlaylistFavoriteChangedDetail,
) {
  window.dispatchEvent(
    new CustomEvent<PlaylistFavoriteChangedDetail>(
      PLAYLIST_FAVORITE_CHANGED_EVENT,
      { detail },
    ),
  );
}

if (playlistFavoriteSyncChannel) {
  playlistFavoriteSyncChannel.onmessage = (
    event: MessageEvent<PlaylistFavoriteChangedDetail>,
  ) => {
    const detail = event.data;
    if (!detail?.playlistId || typeof detail.isFavorite !== "boolean") return;
    dispatchPlaylistFavoriteChanged(detail);
  };
}

export function notifyPlaylistFavoriteChanged(
  playlistId: string,
  isFavorite: boolean,
) {
  const detail = { playlistId, isFavorite };
  dispatchPlaylistFavoriteChanged(detail);
  playlistFavoriteSyncChannel?.postMessage(detail);
}

export function subscribePlaylistFavoriteChanges(
  listener: (detail: PlaylistFavoriteChangedDetail) => void,
) {
  const handleChange = (event: Event) => {
    listener((event as CustomEvent<PlaylistFavoriteChangedDetail>).detail);
  };
  window.addEventListener(PLAYLIST_FAVORITE_CHANGED_EVENT, handleChange);
  return () =>
    window.removeEventListener(PLAYLIST_FAVORITE_CHANGED_EVENT, handleChange);
}

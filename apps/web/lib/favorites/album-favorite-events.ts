export const ALBUM_FAVORITE_CHANGED_EVENT = "album-favorite-changed";

export type AlbumFavoriteChangedDetail = {
  albumId: string;
  isFavorite: boolean;
};

const ALBUM_FAVORITE_SYNC_CHANNEL = "album-favorite-changes";

const albumFavoriteSyncChannel =
  typeof window !== "undefined" && "BroadcastChannel" in window
    ? new BroadcastChannel(ALBUM_FAVORITE_SYNC_CHANNEL)
    : null;

function dispatchAlbumFavoriteChanged(detail: AlbumFavoriteChangedDetail) {
  window.dispatchEvent(
    new CustomEvent<AlbumFavoriteChangedDetail>(ALBUM_FAVORITE_CHANGED_EVENT, {
      detail,
    }),
  );
}

if (albumFavoriteSyncChannel) {
  albumFavoriteSyncChannel.onmessage = (
    event: MessageEvent<AlbumFavoriteChangedDetail>,
  ) => {
    const detail = event.data;
    if (!detail?.albumId || typeof detail.isFavorite !== "boolean") return;
    dispatchAlbumFavoriteChanged(detail);
  };
}

export function notifyAlbumFavoriteChanged(
  albumId: string,
  isFavorite: boolean,
) {
  const detail = { albumId, isFavorite };
  dispatchAlbumFavoriteChanged(detail);
  albumFavoriteSyncChannel?.postMessage(detail);
}

export function subscribeAlbumFavoriteChanges(
  listener: (detail: AlbumFavoriteChangedDetail) => void,
) {
  const handleChange = (event: Event) => {
    listener((event as CustomEvent<AlbumFavoriteChangedDetail>).detail);
  };
  window.addEventListener(ALBUM_FAVORITE_CHANGED_EVENT, handleChange);
  return () =>
    window.removeEventListener(ALBUM_FAVORITE_CHANGED_EVENT, handleChange);
}

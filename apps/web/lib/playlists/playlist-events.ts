export const PLAYLIST_CHANGED_EVENT = "playlist:changed";

export function notifyPlaylistChanged(playlistId: string) {
  window.dispatchEvent(
    new CustomEvent<string>(PLAYLIST_CHANGED_EVENT, { detail: playlistId }),
  );
}

const SONG_LIBRARY_CHANGED_EVENT = "song-library-changed";

export function notifySongLibraryChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(SONG_LIBRARY_CHANGED_EVENT));
}

export function subscribeSongLibraryChanged(callback: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  window.addEventListener(SONG_LIBRARY_CHANGED_EVENT, callback);

  return () => {
    window.removeEventListener(SONG_LIBRARY_CHANGED_EVENT, callback);
  };
}

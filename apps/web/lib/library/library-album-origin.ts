const STORAGE_PREFIX = "musical:library-album-origin:";
const ALLOWED_ORIGINS = new Set(["/library/albums", "/library/recently-added"]);

function key(albumId: string) {
  return `${STORAGE_PREFIX}${albumId}`;
}

/** Records the Library surface that opened an album without changing its URL. */
export function setLibraryAlbumOrigin(albumId: string, origin: string) {
  if (!ALLOWED_ORIGINS.has(origin)) return;
  window.sessionStorage.setItem(key(albumId), origin);
}

/** Returns and clears the one-time return surface after a Library deletion. */
export function consumeLibraryAlbumOrigin(albumId: string) {
  const storageKey = key(albumId);
  const origin = window.sessionStorage.getItem(storageKey);
  window.sessionStorage.removeItem(storageKey);
  return origin && ALLOWED_ORIGINS.has(origin) ? origin : null;
}

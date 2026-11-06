/** Produces the canonical key used by catalog search, cache, and ranking. */
export const CATALOG_SEARCH_TOP_RESULTS_PREVIEW_LIMIT = 6;
export const CATALOG_SEARCH_QUERY_MAX_LENGTH = 160;
export const CATALOG_SEARCH_TOP_RESULTS_MAX_ITEMS = 30;
export const CATALOG_SEARCH_MOBILE_SHELF_MAX_ITEMS = 30;
export const CATALOG_RECENT_SEARCH_LIMIT = 10;
export const CATALOG_SEARCH_TOP_RESULTS_PREVIEW_POOL_LIMIT = 30;
export const CATALOG_SEARCH_SHELF_PREVIEW_LIMIT = 12;
export const CATALOG_SEARCH_ARTIST_SHELF_PREVIEW_LIMIT = 10;
export const CATALOG_SEARCH_SONG_SHELF_PREVIEW_LIMIT = 21;
export const CATALOG_SEARCH_SHELF_MAX_ITEMS = 100;
export const CATALOG_SEARCH_SHELF_PREVIEW_POOL_LIMIT = 30;
export const CATALOG_SEARCH_EXPANDABLE_SHELF_TYPES = [
  "songs",
  "artists",
  "albums",
  "playlists",
  "music-videos",
] as const;
export type CatalogSearchExpandableShelfType =
  (typeof CATALOG_SEARCH_EXPANDABLE_SHELF_TYPES)[number];

export function normalizeCatalogSearchQuery(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

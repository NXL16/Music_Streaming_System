import { clearCachedQueries } from "@/lib/api/query-cache";
import { invalidateCatalogResourceCache } from "@/lib/catalog/catalog.api";
import { clearFavoriteStore } from "@/lib/favorites/use-favorite-store";
import { clearLibraryResourcesCache } from "@/lib/library/library-resources.api";
import { invalidateHomeRecommendationsCache } from "@/lib/recommendations/recommendation.api";
import { clearRecentlyPlayedSnapshot } from "@/lib/recommendations/recently-played-snapshot";

/** Removes in-memory state that belongs to the current authenticated user. */
export function clearClientSessionCache() {
  clearCachedQueries();
  invalidateCatalogResourceCache();
  invalidateHomeRecommendationsCache();
  clearRecentlyPlayedSnapshot();
  clearFavoriteStore();
  clearLibraryResourcesCache();
}

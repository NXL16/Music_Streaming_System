import type { MediaCardProps } from "@/components/media/media-card.types";
import { recordCatalogSearchClick } from "./catalog.api";
import type { SearchResults } from "./search.mapper";

export const CATALOG_SEARCH_CLICK_RECORDED_EVENT =
  "catalog-search-click-recorded";

export function recordCatalogSearchSelection(
  resourceType: string,
  resourceId: string,
) {
  void recordCatalogSearchClick(resourceType, resourceId)
    .then(() => {
      window.dispatchEvent(new Event(CATALOG_SEARCH_CLICK_RECORDED_EVENT));
    })
    .catch(() => undefined);
}

export function attachCatalogSearchClickTracking(cards: MediaCardProps[]) {
  return cards.map((card) => ({
    ...card,
    onOpen: () => {
      recordCatalogSearchSelection(card.resourceType, card.resourceId);
    },
  }));
}

export function attachSearchResultsClickTracking(
  results: SearchResults,
): SearchResults {
  return {
    ...results,
    songs: attachCatalogSearchClickTracking(results.songs),
    artists: attachCatalogSearchClickTracking(results.artists),
    albums: attachCatalogSearchClickTracking(results.albums),
    playlists: attachCatalogSearchClickTracking(results.playlists),
    musicVideos: attachCatalogSearchClickTracking(results.musicVideos),
    ordered: attachCatalogSearchClickTracking(results.ordered),
  };
}

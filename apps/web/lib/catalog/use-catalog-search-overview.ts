"use client";

import { useCallback, useMemo } from "react";
import { useAsyncResource } from "@/lib/api/use-async-resource";
import { useAuthStore } from "@/lib/auth/auth-store";
import {
  searchCatalogOverview,
  getCatalogSearchOverviewSnapshot,
} from "./catalog.api";
import { mapSearchResults, type SearchResults } from "./search.mapper";
import { attachSearchResultsClickTracking } from "./search-click-tracking";
import { EMPTY_SEARCH_RESULTS } from "./use-catalog-search";

type SearchOverview = {
  topResults: SearchResults;
  shelves: SearchResults;
};

const EMPTY_OVERVIEW: SearchOverview = {
  topResults: EMPTY_SEARCH_RESULTS,
  shelves: EMPTY_SEARCH_RESULTS,
};

function mapOverview(
  response: Awaited<ReturnType<typeof searchCatalogOverview>>,
) {
  return {
    topResults: attachSearchResultsClickTracking(
      mapSearchResults({
        data: response.topResults.data,
        resources: response.resources,
        hasMore: response.topResults.hasMore,
      }),
    ),
    shelves: attachSearchResultsClickTracking(
      mapSearchResults({
        data: response.shelves.data,
        resources: response.resources,
        musicVideos: response.shelves.musicVideos,
        shelfHasMore: response.shelves.shelfHasMore,
      }),
    ),
  };
}

export function useCatalogSearchOverview(
  query: string,
  { topLimit, shelfLimit }: { topLimit?: number; shelfLimit?: number },
) {
  const trimmedQuery = query.trim();
  const userId = useAuthStore((state) => state.user?.userId);
  const initialData = useMemo(
    () =>
      getCatalogSearchOverviewSnapshot(
        trimmedQuery,
        { topLimit, shelfLimit },
        userId ?? null,
      ),
    [trimmedQuery, topLimit, shelfLimit, userId],
  );
  const load = useCallback(
    (signal?: AbortSignal) => {
      if (useAuthStore.getState().user?.userId !== userId)
        throw new DOMException("Session changed", "AbortError");
      return searchCatalogOverview(
        trimmedQuery,
        { topLimit, shelfLimit },
        signal,
      );
    },
    [trimmedQuery, topLimit, shelfLimit, userId],
  );
  const { data, loading, error, reload } = useAsyncResource(
    load,
    "Unable to search. Please try again.",
    {
      initialData,
      enabled: Boolean(trimmedQuery),
    },
  );
  const overview = useMemo(
    () => (data ? mapOverview(data) : EMPTY_OVERVIEW),
    [data],
  );
  return {
    ...overview,
    loading: Boolean(trimmedQuery) && loading,
    error: error || null,
    retry: reload,
  };
}

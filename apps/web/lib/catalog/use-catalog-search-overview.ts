"use client";

import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { searchCatalogOverview } from "./catalog.api";
import { mapSearchResults, type SearchResults } from "./search.mapper";
import { attachSearchResultsClickTracking } from "./search-click-tracking";
import { EMPTY_SEARCH_RESULTS } from "./use-catalog-search";
import { useMinimumLoadingState } from "@/lib/loading/use-minimum-loading-duration";
import { normalizeCatalogSearchQuery } from "@musical/shared-constants";

type SearchOverview = {
  topResults: SearchResults;
  shelves: SearchResults;
};

const EMPTY_OVERVIEW: SearchOverview = {
  topResults: EMPTY_SEARCH_RESULTS,
  shelves: EMPTY_SEARCH_RESULTS,
};

type SearchOverviewState = {
  key: string;
  data: SearchOverview;
  error: string | null;
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
  const normalizedQuery = normalizeCatalogSearchQuery(trimmedQuery);
  const key = [
    normalizedQuery,
    topLimit ?? "",
    shelfLimit ?? "",
  ].join(":");
  const [state, setState] = useState<SearchOverviewState>({
    key: "",
    data: EMPTY_OVERVIEW,
    error: null,
  });
  const [loading, setLoading] = useMinimumLoadingState();
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!trimmedQuery) return;
    const controller = new AbortController();
    setLoading(true);
    void searchCatalogOverview(
      trimmedQuery,
      { topLimit, shelfLimit },
      controller.signal,
    )
      .then((response) => {
        if (controller.signal.aborted) return;
        setState({ key, data: mapOverview(response), error: null });
      })
      .catch((cause) => {
        if (
          controller.signal.aborted ||
          (isAxiosError(cause) && cause.code === "ERR_CANCELED")
        ) {
          return;
        }
        setState({
          key,
          data: EMPTY_OVERVIEW,
          error: "Unable to search. Please try again.",
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [key, retryKey, setLoading, shelfLimit, topLimit, trimmedQuery]);

  const isCurrent = state.key === key;
  return {
    topResults: isCurrent ? state.data.topResults : EMPTY_SEARCH_RESULTS,
    shelves: isCurrent ? state.data.shelves : EMPTY_SEARCH_RESULTS,
    loading: Boolean(trimmedQuery) && (loading || !isCurrent),
    error: isCurrent ? state.error : null,
    retry: () => setRetryKey((current) => current + 1),
  };
}

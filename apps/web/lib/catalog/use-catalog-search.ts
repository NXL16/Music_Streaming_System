"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@/lib/auth/auth-store";
import { isAxiosError } from "axios";
import {
  searchCatalogShelf,
  searchCatalogResults,
  searchCatalogSuggestions,
  getCatalogSearchPageSnapshot,
  type CatalogSearchShelfType,
} from "./catalog.api";
import { attachSearchResultsClickTracking } from "./search-click-tracking";
import { mapSearchResults, type SearchResults } from "./search.mapper";
import { useMinimumLoadingState } from "@/lib/loading/use-minimum-loading-duration";
import { normalizeCatalogSearchQuery } from "@musical/shared-constants";

const DEBOUNCE_MS = 150;
type CatalogSearchSource = "results" | "shelf" | "suggestions";

type CatalogSearchOptions = {
  enabled?: boolean;
  keepPreviousResults?: boolean;
  source?: CatalogSearchSource;
  shelfType?: CatalogSearchShelfType;
  limit?: number;
  offset?: number;
};

export const EMPTY_SEARCH_RESULTS: SearchResults = {
  hints: [],
  ordered: [],
  songs: [],
  trackSongs: [],
  artists: [],
  albums: [],
  playlists: [],
  musicVideos: [],
  hasMore: false,
  shelfHasMore: {},
  isEmpty: true,
};

type SearchState = {
  userId?: string;
  key: string;
  query: string;
  results: SearchResults;
  error: string | null;
};

function requestCatalogSearch(
  source: CatalogSearchSource,
  query: string,
  shelfType: CatalogSearchShelfType | undefined,
  options: { limit?: number; offset?: number },
  signal: AbortSignal,
) {
  switch (source) {
    case "results":
      return searchCatalogResults(query, options, signal);
    case "suggestions":
      return searchCatalogSuggestions(query, signal);
    case "shelf":
      if (!shelfType) {
        return Promise.reject(new Error("SEARCH_SHELF_TYPE_REQUIRED"));
      }
      return searchCatalogShelf(query, shelfType, options, signal);
  }
}

/** Searches the catalog with debouncing, cancellation, and stale-result guards. */
export function useCatalogSearch(
  query: string,
  {
    enabled = true,
    keepPreviousResults = true,
    source = "suggestions",
    shelfType,
    limit,
    offset,
  }: CatalogSearchOptions = {},
) {
  const trimmedQuery = query.trim();
  const normalizedQuery = normalizeCatalogSearchQuery(trimmedQuery);
  const hasQuery = enabled && Boolean(trimmedQuery);
  const [retryKey, setRetryKey] = useState(0);
  const userId = useAuthStore((state) => state.user?.userId);
  const searchKey = [
    normalizedQuery,
    source,
    shelfType ?? "",
    limit ?? "",
    offset ?? "",
    userId ?? "guest",
    retryKey,
  ].join(":");
  const cachedResults = useMemo(() => {
    if (source === "suggestions") return undefined;
    const response = getCatalogSearchPageSnapshot(
      trimmedQuery,
      {
        source,
        shelfType,
        limit,
        offset,
      },
      userId ?? null,
    );
    return response
      ? attachSearchResultsClickTracking(mapSearchResults(response))
      : undefined;
  }, [trimmedQuery, source, shelfType, limit, offset, userId]);
  const [state, setState] = useState<SearchState>({
    key: "",
    query: "",
    results: EMPTY_SEARCH_RESULTS,
    error: null,
  });
  const [loading, setLoading] = useMinimumLoadingState();

  useEffect(() => {
    if (!hasQuery || state.key === searchKey || cachedResults) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    const search = () => {
      requestCatalogSearch(
        source,
        trimmedQuery,
        shelfType,
        { limit, offset },
        controller.signal,
      )
        .then((response) => {
          if (controller.signal.aborted) return;
          setState({
            userId,
            key: searchKey,
            query: normalizedQuery,
            results: attachSearchResultsClickTracking(
              mapSearchResults(response),
            ),
            error: null,
          });
        })
        .catch((cause) => {
          if (
            controller.signal.aborted ||
            (isAxiosError(cause) && cause.code === "ERR_CANCELED")
          ) {
            return;
          }
          setState({
            userId,
            key: searchKey,
            query: normalizedQuery,
            results: EMPTY_SEARCH_RESULTS,
            error: "Không thấy tìm kiếm. Vui lòng thử lại.",
          });
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    };
    const timer =
      source === "suggestions"
        ? window.setTimeout(search, DEBOUNCE_MS)
        : undefined;

    if (timer === undefined) search();

    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    hasQuery,
    limit,
    offset,
    searchKey,
    setLoading,
    shelfType,
    state.key,
    source,
    trimmedQuery,
    normalizedQuery,
    cachedResults,
    userId,
  ]);

  const isCurrentResult = state.key === searchKey || Boolean(cachedResults);
  const currentResults =
    state.key === searchKey ? state.results : cachedResults;
  const hasRelatedPreviousQuery =
    Boolean(state.query) &&
    (normalizedQuery.startsWith(state.query) ||
      state.query.startsWith(normalizedQuery));
  // Keep the previous suggestion list visible while the next debounced
  // request is in flight only when the query is being refined. Unrelated
  // queries must not briefly render stale suggestions.
  const canKeepPreviousResults =
    keepPreviousResults &&
    state.userId === userId &&
    hasQuery &&
    hasRelatedPreviousQuery &&
    Boolean(state.key) &&
    !state.error;
  const isAwaitingCurrentResult =
    hasQuery && !isCurrentResult && !canKeepPreviousResults;

  return {
    results:
      hasQuery && (isCurrentResult || canKeepPreviousResults)
        ? (currentResults ?? state.results)
        : EMPTY_SEARCH_RESULTS,
    loading: hasQuery && !cachedResults && (loading || isAwaitingCurrentResult),
    error: hasQuery && state.key === searchKey ? state.error : null,
    hasRelatedPreviousResults: canKeepPreviousResults,
    isCurrentQueryResolved: hasQuery && isCurrentResult,
    retry: () => setRetryKey((current) => current + 1),
  };
}

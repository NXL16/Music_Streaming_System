"use client";

import { useEffect, useMemo, useState } from "react";
import { isAxiosError } from "axios";
import { recordCatalogSearchClick, searchCatalog } from "./catalog.api";
import { mapSearchResults, type SearchResults } from "./search.mapper";
import { useMinimumLoadingState } from "@/lib/loading/use-minimum-loading-duration";

const DEBOUNCE_MS = 300;

export const CATALOG_SEARCH_FILTERS = [
  "all",
  "songs",
  "artists",
  "albums",
  "playlists",
] as const;

export type CatalogSearchFilter = (typeof CATALOG_SEARCH_FILTERS)[number];

const EMPTY_RESULTS: SearchResults = {
  songs: [],
  artists: [],
  albums: [],
  playlists: [],
  isEmpty: true,
};

type SearchState = {
  key: string;
  results: SearchResults;
  error: string | null;
};

function withSearchClickTracking(results: SearchResults): SearchResults {
  const track = (resourceType: string, resourceId: string) => {
    void recordCatalogSearchClick(resourceType, resourceId).catch(
      () => undefined,
    );
  };
  const attach = (cards: SearchResults["songs"]) =>
    cards.map((card) => ({
      ...card,
      onOpen: () => track(card.resourceType, card.resourceId),
    }));

  return {
    ...results,
    songs: attach(results.songs),
    artists: attach(results.artists),
    albums: attach(results.albums),
    playlists: attach(results.playlists),
  };
}

function typesForFilter(filter: CatalogSearchFilter) {
  return filter === "all" ? undefined : [filter];
}

/** Searches the catalog with debouncing, cancellation, and stale-result guards. */
export function useCatalogSearch(
  query: string,
  filter: CatalogSearchFilter = "all",
) {
  const trimmedQuery = query.trim();
  const hasQuery = Boolean(trimmedQuery);
  const searchKey = `${filter}:${trimmedQuery.toLocaleLowerCase()}`;
  const [state, setState] = useState<SearchState>({
    key: "",
    results: EMPTY_RESULTS,
    error: null,
  });
  const [loading, setLoading] = useMinimumLoadingState();
  const types = useMemo(() => typesForFilter(filter), [filter]);

  useEffect(() => {
    if (!hasQuery) return;

    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => {
      searchCatalog(trimmedQuery, { types }, controller.signal)
        .then((response) => {
          if (controller.signal.aborted) return;
          setState({
            key: searchKey,
            results: withSearchClickTracking(mapSearchResults(response)),
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
            key: searchKey,
            results: EMPTY_RESULTS,
            error: "Không thấy tìm kiếm. Vui lòng thử lại.",
          });
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [hasQuery, searchKey, setLoading, trimmedQuery, types]);

  const isCurrentResult = state.key === searchKey;

  return {
    results: hasQuery && isCurrentResult ? state.results : EMPTY_RESULTS,
    loading: hasQuery && loading,
    error: hasQuery && isCurrentResult ? state.error : null,
  };
}

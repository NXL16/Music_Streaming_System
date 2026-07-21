"use client";

import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { searchCatalog } from "./catalog.api";
import { mapSearchResults, type SearchResults } from "./search.mapper";

const DEBOUNCE_MS = 300;

const EMPTY_RESULTS: SearchResults = {
  songs: [],
  artists: [],
  albums: [],
  isEmpty: true,
};

export function useCatalogSearch(query: string) {
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasQuery = Boolean(query.trim());

  useEffect(() => {
    const trimmed = query.trim();

    if (!trimmed) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      searchCatalog(trimmed, controller.signal)
        .then((response) => {
          setResults(mapSearchResults(response));
          setError(null);
        })
        .catch((cause) => {
          // A superseded query aborts its request; that is not a user error.
          if (isAxiosError(cause) && cause.code === "ERR_CANCELED") return;
          setResults(EMPTY_RESULTS);
          setError("Không thể tìm kiếm. Vui lòng thử lại.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // Empty-query state is derived instead of synchronously resetting state in
  // the effect. This avoids an unnecessary render cascade when the user
  // clears the search input while preserving the same visible result.
  return {
    results: hasQuery ? results : EMPTY_RESULTS,
    loading: hasQuery && loading,
    error: hasQuery ? error : null,
  };
}

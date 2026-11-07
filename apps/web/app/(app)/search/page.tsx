"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SearchResults from "@/components/search/search-results";
import RecentlySearched from "@/components/search/recently-searched";
import {
  SearchWrapper,
  type SearchSuggestion,
} from "@/components/search/search-wrapper";
import type { CatalogSearchShelfType } from "@/lib/catalog/catalog.api";
import { useCatalogSearch } from "@/lib/catalog/use-catalog-search";
import { useCatalogSearchOverview } from "@/lib/catalog/use-catalog-search-overview";
import { useSearchSongShelfPages } from "@/lib/catalog/use-search-song-shelf-pages";
import {
  CATALOG_SEARCH_ARTIST_SHELF_PREVIEW_LIMIT,
  CATALOG_SEARCH_MOBILE_SHELF_MAX_ITEMS,
  CATALOG_SEARCH_SHELF_MAX_ITEMS,
  CATALOG_SEARCH_SHELF_PREVIEW_LIMIT,
  CATALOG_SEARCH_TOP_RESULTS_MAX_ITEMS,
  CATALOG_SEARCH_TOP_RESULTS_PREVIEW_LIMIT,
} from "@musical/shared-constants";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useRecentlySearched } from "@/lib/catalog/use-recently-searched";
import { useShelfDetailHistory } from "@/hooks/use-shelf-detail-history";

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("term") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const [expandedTopResultsTerm, setExpandedTopResultsTerm] = useState<
    string | null
  >(null);
  const { open: openTopResults, close: closeTopResults } =
    useShelfDetailHistory({
      owner: `search-top-results:${urlQuery}`,
      selected: expandedTopResultsTerm,
      setSelected: setExpandedTopResultsTerm,
      getKey: (term) => term,
    });
  const [expandedTopResultsRequestKey, setExpandedTopResultsRequestKey] =
    useState(0);
  const [expandedShelfType, setExpandedShelfType] =
    useState<CatalogSearchShelfType | null>(null);
  const { open: openShelf, close: closeShelf } = useShelfDetailHistory({
    owner: `search-shelf:${urlQuery}`,
    selected: expandedShelfType,
    setSelected: setExpandedShelfType,
    getKey: (type) => type,
  });
  const [expandedCardShelfRequestKey, setExpandedCardShelfRequestKey] =
    useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [isCancellingSearch, setIsCancellingSearch] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchRootRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const hasAutoFocusedRef = useRef(false);
  const trimmedQuery = query.trim();
  const hasPendingSearch = trimmedQuery !== urlQuery;
  const maxWidth484 = useMediaQuery("(max-width: 483px)");
  const shouldOpenSuggestions =
    isFocused && Boolean(trimmedQuery) && hasPendingSearch;
  const isTopResultsExpanded = expandedTopResultsTerm === urlQuery;
  const isCatalogShelfExpanded = expandedShelfType !== null;
  const isSearchDetailExpanded = isTopResultsExpanded || isCatalogShelfExpanded;
  const expandedCardShelfPreviewLimit =
    expandedShelfType === "artists"
      ? CATALOG_SEARCH_ARTIST_SHELF_PREVIEW_LIMIT
      : CATALOG_SEARCH_SHELF_PREVIEW_LIMIT;

  const searchOverview = useCatalogSearchOverview(urlQuery, {
    topLimit: maxWidth484
      ? CATALOG_SEARCH_TOP_RESULTS_MAX_ITEMS
      : CATALOG_SEARCH_TOP_RESULTS_PREVIEW_LIMIT,
    shelfLimit: maxWidth484 ? CATALOG_SEARCH_MOBILE_SHELF_MAX_ITEMS : undefined,
  });
  const expandedResultSearch = useCatalogSearch(urlQuery, {
    enabled: isTopResultsExpanded,
    keepPreviousResults: false,
    source: "results",
    limit:
      CATALOG_SEARCH_TOP_RESULTS_MAX_ITEMS -
      CATALOG_SEARCH_TOP_RESULTS_PREVIEW_LIMIT,
    offset: CATALOG_SEARCH_TOP_RESULTS_PREVIEW_LIMIT,
    requestKey: expandedTopResultsRequestKey,
  });
  const expandedCardShelfSearch = useCatalogSearch(urlQuery, {
    enabled: isCatalogShelfExpanded && expandedShelfType !== "songs",
    keepPreviousResults: false,
    source: "shelf",
    shelfType: expandedShelfType ?? undefined,
    limit: CATALOG_SEARCH_SHELF_MAX_ITEMS - expandedCardShelfPreviewLimit,
    offset: expandedCardShelfPreviewLimit,
    requestKey: expandedCardShelfRequestKey,
  });
  const expandedSongShelf = useSearchSongShelfPages(urlQuery, {
    enabled: isCatalogShelfExpanded && expandedShelfType === "songs",
    initialSongs: searchOverview.shelves.trackSongs,
    initialHasMore: Boolean(searchOverview.shelves.shelfHasMore.songs),
  });
  const suggestionSearch = useCatalogSearch(trimmedQuery, {
    enabled: shouldOpenSuggestions,
  });
  const recentlySearched = useRecentlySearched(!urlQuery);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setQuery(urlQuery);
      setActiveIndex(-1);
      setIsCancellingSearch(false);
      setExpandedTopResultsTerm(null);
      setExpandedShelfType(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [urlQuery]);

  useEffect(() => {
    if (maxWidth484 || isSearchDetailExpanded || hasAutoFocusedRef.current) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      if (!searchInputRef.current || hasAutoFocusedRef.current) return;
      hasAutoFocusedRef.current = true;
      searchInputRef.current.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [isSearchDetailExpanded, maxWidth484]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!searchRootRef.current?.contains(event.target as Node)) {
        setIsFocused(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const suggestions = useMemo<SearchSuggestion[]>(() => {
    if (!trimmedQuery) return [];
    const availableSuggestions = [
      ...suggestionSearch.results.hints
        .slice(0, 3)
        .map((value) => ({ kind: "query" as const, value })),
      ...suggestionSearch.results.ordered
        .slice(0, 10)
        .map((card) => ({ kind: "media" as const, card })),
    ];

    const shouldKeepEmptySuggestion =
      suggestionSearch.isCurrentQueryResolved ||
      suggestionSearch.hasRelatedPreviousResults;

    if (
      availableSuggestions.length === 0 &&
      shouldKeepEmptySuggestion &&
      !suggestionSearch.error
    ) {
      return [{ kind: "query", value: trimmedQuery }];
    }

    return availableSuggestions;
  }, [
    suggestionSearch.error,
    suggestionSearch.hasRelatedPreviousResults,
    suggestionSearch.isCurrentQueryResolved,
    suggestionSearch.results.hints,
    suggestionSearch.results.ordered,
    trimmedQuery,
  ]);

  const isOpen = shouldOpenSuggestions;
  const hasVisibleSuggestions = isOpen && suggestions.length > 0;
  const submitSearch = (value: string) => {
    const normalizedValue = value.trim();
    if (!normalizedValue) return;
    searchInputRef.current?.blur();
    setQuery(normalizedValue);
    setIsFocused(false);
    setActiveIndex(-1);
    router.push("/search?term=" + encodeURIComponent(normalizedValue));
  };
  const selectSuggestion = (suggestion: SearchSuggestion) => {
    if (suggestion.kind === "query") return submitSearch(suggestion.value);
    suggestion.card.onOpen?.();
    searchInputRef.current?.blur();
    setIsFocused(false);
    setActiveIndex(-1);
    if (suggestion.card.slug) router.push(suggestion.card.slug);
  };
  const searchWrapper = (
    <SearchWrapper
      activeIndex={activeIndex}
      inputRef={searchInputRef}
      isLoading={suggestionSearch.loading}
      isOpen={hasVisibleSuggestions}
      onEscape={() => {
        setIsFocused(false);
        setActiveIndex(-1);
      }}
      onCancel={() => {
        searchInputRef.current?.blur();
        setQuery("");
        setIsFocused(false);
        setActiveIndex(-1);
        if (urlQuery) {
          setIsCancellingSearch(true);
          router.replace("/search");
          return;
        }
      }}
      onFocus={() => setIsFocused(true)}
      onQueryChange={(nextQuery) => {
        setQuery(nextQuery);
        setActiveIndex(-1);
        if (nextQuery.trim() !== urlQuery) setIsFocused(true);
      }}
      onSelect={selectSuggestion}
      onSubmit={() => {
        const selected = suggestions[activeIndex];
        if (selected) selectSuggestion(selected);
        else submitSearch(query);
      }}
      query={query}
      rootRef={searchRootRef}
      setActiveIndex={setActiveIndex}
      showCancel={maxWidth484 && Boolean(trimmedQuery)}
      suggestions={suggestions}
      trimmedQuery={trimmedQuery}
    />
  );

  return (
    <div className="desktop-search-page">
      {!isSearchDetailExpanded &&
        (maxWidth484 ? (
          searchWrapper
        ) : (
          <div className="search-controls-bar">
            <div className="search-scope-bar scope-bar-non-material">
              <div className="content-scope-bar content-scope-bar--desktop">
                <div className="content-scope-bar__content">
                  <div className="search-input search-input--with-scope">
                    {searchWrapper}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

      {urlQuery && !isCancellingSearch && (
        <SearchResults
          error={searchOverview.error}
          expandedError={expandedResultSearch.error}
          expandedLoading={expandedResultSearch.loading}
          expandedResults={expandedResultSearch.results}
          loading={searchOverview.loading}
          onRetry={searchOverview.retry}
          results={searchOverview.topResults}
          term={urlQuery}
          isTopResultsExpanded={isTopResultsExpanded}
          onCollapseTopResults={closeTopResults}
          onExpandTopResults={() => {
            setIsFocused(false);
            setActiveIndex(-1);
            setExpandedTopResultsRequestKey((current) => current + 1);
            openTopResults(urlQuery);
          }}
          onRetryExpanded={expandedResultSearch.retry}
          expandedShelfError={expandedCardShelfSearch.error}
          expandedShelfLoading={expandedCardShelfSearch.loading}
          expandedShelfResults={expandedCardShelfSearch.results}
          expandedSongShelfError={expandedSongShelf.error}
          expandedSongShelfHasMore={expandedSongShelf.hasMore}
          expandedSongShelfLoadingMore={expandedSongShelf.loadingMore}
          expandedSongShelfSongs={expandedSongShelf.songs}
          expandedShelfType={expandedShelfType}
          onCollapseShelf={closeShelf}
          onExpandShelf={(type) => {
            setIsFocused(false);
            setActiveIndex(-1);
            if (type !== "songs")
              setExpandedCardShelfRequestKey((current) => current + 1);
            openShelf(type);
          }}
          onRetryExpandedShelf={expandedCardShelfSearch.retry}
          onLoadMoreExpandedSongs={expandedSongShelf.loadMore}
          shelfError={searchOverview.error}
          shelfLoading={searchOverview.loading}
          shelfResults={searchOverview.shelves}
        />
      )}
      {!urlQuery && !recentlySearched.loading && (
        <RecentlySearched
          items={recentlySearched.cards}
          onClear={() => void recentlySearched.clear()}
        />
      )}
    </div>
  );
}

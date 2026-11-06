"use client";

import { useCallback, useEffect, useState } from "react";
import type { MediaCardProps } from "@/components/media/media-card.types";
import {
  clearCatalogRecentSearches,
  getCatalogRecentSearches,
} from "./catalog.api";
import {
  attachCatalogSearchClickTracking,
  CATALOG_SEARCH_CLICK_RECORDED_EVENT,
} from "./search-click-tracking";
import { mapSearchResults } from "./search.mapper";

type RecentSearchState = {
  cards: MediaCardProps[];
  loaded: boolean;
};

const INITIAL_STATE: RecentSearchState = { cards: [], loaded: false };

export function useRecentlySearched(enabled: boolean) {
  const [state, setState] = useState(INITIAL_STATE);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await getCatalogRecentSearches(signal);
    const results = mapSearchResults(response);
    const cardsByResource = new Map(
      [...results.ordered, ...results.musicVideos].map((card) => [
        `${card.resourceType}:${card.resourceId}`,
        card,
      ]),
    );
    return attachCatalogSearchClickTracking(
      response.data.flatMap((reference) => {
        const card = cardsByResource.get(`${reference.type}:${reference.id}`);
        return card ? [card] : [];
      }),
    );
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void load(controller.signal)
      .then((cards) => {
        if (!controller.signal.aborted) setState({ cards, loaded: true });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState((current) => ({ ...current, loaded: true }));
        }
      });
    return () => controller.abort();
  }, [enabled, load, refreshKey]);

  useEffect(() => {
    if (!enabled) return;
    const refresh = () => setRefreshKey((current) => current + 1);
    window.addEventListener(CATALOG_SEARCH_CLICK_RECORDED_EVENT, refresh);
    return () =>
      window.removeEventListener(CATALOG_SEARCH_CLICK_RECORDED_EVENT, refresh);
  }, [enabled]);

  const clear = useCallback(async () => {
    const previousCards = state.cards;
    setState((current) => ({ ...current, cards: [] }));
    try {
      await clearCatalogRecentSearches();
    } catch {
      setState((current) => ({ ...current, cards: previousCards }));
    }
  }, [state.cards]);

  return { cards: state.cards, clear, loading: enabled && !state.loaded };
}

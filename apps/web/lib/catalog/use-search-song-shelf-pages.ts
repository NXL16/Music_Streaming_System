"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCachedQuerySnapshot, setCachedQuery } from "@/lib/api/query-cache";
import { useAuthStore } from "@/lib/auth/auth-store";
import { isAxiosError } from "axios";
import {
  CATALOG_SEARCH_SONG_SHELF_PREVIEW_LIMIT,
  normalizeCatalogSearchQuery,
} from "@musical/shared-constants";
import { searchCatalogShelf } from "./catalog.api";
import { mapSearchResults } from "./search.mapper";
import { playerSongKey, type PlayerSong } from "@/lib/player/use-player-store";

type SearchSongShelfPagesOptions = {
  enabled: boolean;
  initialSongs: PlayerSong[];
  initialHasMore: boolean;
};

type SongShelfPageState = {
  key: string;
  songs: PlayerSong[];
  hasMore: boolean;
  loadingMore: boolean;
  error: string | null;
};

const EMPTY_STATE: SongShelfPageState = {
  key: "",
  songs: [],
  hasMore: false,
  loadingMore: false,
  error: null,
};

function appendUniqueSongs(current: PlayerSong[], incoming: PlayerSong[]) {
  const ids = new Set(current.map(playerSongKey));
  const songs = [...current];

  for (const song of incoming) {
    const key = playerSongKey(song);
    if (ids.has(key)) continue;
    ids.add(key);
    songs.push(song);
  }

  return songs;
}

export function useSearchSongShelfPages(
  query: string,
  { enabled, initialSongs, initialHasMore }: SearchSongShelfPagesOptions,
) {
  const userId = useAuthStore((state) => state.user?.userId);
  const key = JSON.stringify([
    "search-song-pages",
    userId ?? null,
    normalizeCatalogSearchQuery(query),
  ]);
  const cachedPage = useMemo(
    () =>
      getCachedQuerySnapshot<Pick<SongShelfPageState, "songs" | "hasMore">>(
        key,
      ),
    [key],
  );
  const [state, setState] = useState<SongShelfPageState>(EMPTY_STATE);
  const pageState = useMemo(
    () =>
      state.key === key
        ? state
        : cachedPage
          ? { key, ...cachedPage, loadingMore: false, error: null }
          : EMPTY_STATE,
    [state, key, cachedPage],
  );
  const requestIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
      setState((current) =>
        current.key === key && current.loadingMore
          ? { ...current, loadingMore: false }
          : current,
      );
    };
  }, [enabled, key]);

  const loadMore = useCallback(() => {
    const isCurrent = pageState.key === key;
    const songs = isCurrent ? pageState.songs : initialSongs;
    const hasMore = isCurrent ? pageState.hasMore : initialHasMore;
    const loadingMore = isCurrent && pageState.loadingMore;

    if (!enabled || loadingMore || !hasMore) {
      return;
    }

    const requestId = ++requestIdRef.current;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    const offset = songs.length;

    setState({
      key,
      songs,
      hasMore,
      loadingMore: true,
      error: null,
    });

    void searchCatalogShelf(
      query,
      "songs",
      {
        limit: CATALOG_SEARCH_SONG_SHELF_PREVIEW_LIMIT,
        offset,
      },
      controller.signal,
    )
      .then((response) => {
        if (
          controller.signal.aborted ||
          requestId !== requestIdRef.current ||
          useAuthStore.getState().user?.userId !== userId
        ) {
          return;
        }

        const page = mapSearchResults(response);
        const next = {
          songs: appendUniqueSongs(songs, page.trackSongs),
          hasMore: page.hasMore,
        };
        setState({ key, ...next, loadingMore: false, error: null });
        setCachedQuery(key, next, 2 * 60 * 1000);
      })
      .catch((cause: unknown) => {
        if (
          controller.signal.aborted ||
          requestId !== requestIdRef.current ||
          (isAxiosError(cause) && cause.code === "ERR_CANCELED")
        ) {
          return;
        }
        setState((current) =>
          current.key === key
            ? {
                ...current,
                loadingMore: false,
                error:
                  "Kh\u00f4ng th\u1ec3 t\u1ea3i th\u00eam b\u00e0i h\u00e1t.",
              }
            : current,
        );
      });
  }, [enabled, initialHasMore, initialSongs, key, query, pageState, userId]);

  const isCurrent = enabled && pageState.key === key;
  return {
    songs: isCurrent ? pageState.songs : enabled ? initialSongs : [],
    hasMore: isCurrent ? pageState.hasMore : enabled && initialHasMore,
    loadingMore: isCurrent && pageState.loadingMore,
    error: isCurrent ? pageState.error : null,
    loadMore,
  };
}

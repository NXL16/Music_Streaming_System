"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { CATALOG_SEARCH_SONG_SHELF_PREVIEW_LIMIT } from "@musical/shared-constants";
import { searchCatalogShelf } from "./catalog.api";
import { mapSearchResults } from "./search.mapper";
import type { PlayerSong } from "@/lib/player/use-player-store";

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
  const ids = new Set(current.map((song) => song.id));
  const songs = [...current];

  for (const song of incoming) {
    if (ids.has(song.id)) continue;
    ids.add(song.id);
    songs.push(song);
  }

  return songs;
}

export function useSearchSongShelfPages(
  query: string,
  { enabled, initialSongs, initialHasMore }: SearchSongShelfPagesOptions,
) {
  const key = [query.trim().toLocaleLowerCase(), "songs"].join(":");
  const [state, setState] = useState<SongShelfPageState>(EMPTY_STATE);
  const requestIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [enabled, key]);

  const loadMore = useCallback(() => {
    const isCurrent = state.key === key;
    const songs = isCurrent ? state.songs : initialSongs;
    const hasMore = isCurrent ? state.hasMore : initialHasMore;
    const loadingMore = isCurrent && state.loadingMore;

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
        if (controller.signal.aborted || requestId !== requestIdRef.current) {
          return;
        }

        const page = mapSearchResults(response);
        setState((current) =>
          current.key === key
            ? {
                ...current,
                songs: appendUniqueSongs(current.songs, page.trackSongs),
                hasMore: page.hasMore,
                loadingMore: false,
              }
            : current,
        );
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
  }, [
    enabled,
    initialHasMore,
    initialSongs,
    key,
    query,
    state.hasMore,
    state.key,
    state.loadingMore,
    state.songs,
  ]);

  const isCurrent = enabled && state.key === key;
  return {
    songs: isCurrent ? state.songs : enabled ? initialSongs : [],
    hasMore: isCurrent ? state.hasMore : enabled && initialHasMore,
    loadingMore: isCurrent && state.loadingMore,
    error: isCurrent ? state.error : null,
    loadMore,
  };
}

import { create } from "zustand";
import {
  addFavoriteSong,
  listFavoriteSongs,
  removeFavoriteSong,
} from "@/lib/songs/song.api";
import type { SongSummary } from "@/lib/songs/song.types";
import type { FavoriteCollection } from "@/lib/songs/song.types";
import {
  notifyFavoriteChanged,
  subscribeFavoriteChanges,
} from "./favorite-events";

let hydrationRequest: Promise<void> | null = null;
let hydrationVersion = 0;
const FAVORITES_CACHE_TTL_MS = 3 * 60 * 1000;
const FAVORITES_PAGE_SIZE = 50;
let favoritesCacheExpiresAt = 0;

type FavoriteState = {
  songs: SongSummary[];
  collection?: FavoriteCollection;
  loading: boolean;
  loaded: boolean;
  hydrate: (force?: boolean) => Promise<void>;
  toggle: (songId: string) => Promise<boolean>;
};

export const useFavoriteStore = create<FavoriteState>((set, get) => ({
  songs: [],
  loading: false,
  loaded: false,
  async hydrate(force = false) {
    if (!force && get().loaded && Date.now() < favoritesCacheExpiresAt) {
      return;
    }
    if (!force && hydrationRequest) return hydrationRequest;

    const requestVersion = ++hydrationVersion;
    const showInitialLoading = !get().loaded;
    if (showInitialLoading) set({ loading: true });

    const request = (async () => {
      try {
        const songs: SongSummary[] = [];
        const songIds = new Set<string>();
        const cursors = new Set<string>();
        let cursor: string | undefined;
        let collection: FavoriteCollection | undefined;
        let isFirstPage = true;

        while (true) {
          const response = await listFavoriteSongs(
            { cursor, limit: FAVORITES_PAGE_SIZE },
            { force: force && isFirstPage },
          );
          isFirstPage = false;

          for (const song of response.songs ?? []) {
            if (songIds.has(song.id)) continue;
            songIds.add(song.id);
            songs.push(song);
          }
          collection ??= response.collection;

          if (!response.hasMore) break;
          if (!response.nextCursor || cursors.has(response.nextCursor)) {
            throw new Error("INVALID_FAVORITES_CURSOR");
          }
          cursors.add(response.nextCursor);
          cursor = response.nextCursor;
        }

        if (requestVersion !== hydrationVersion) return;

        set({
          songs,
          collection,
          loaded: true,
        });
        favoritesCacheExpiresAt = Date.now() + FAVORITES_CACHE_TTL_MS;
      } finally {
        if (requestVersion !== hydrationVersion) return;
        hydrationRequest = null;
        if (showInitialLoading) set({ loading: false });
      }
    })();

    hydrationRequest = request;
    return request;
  },
  async toggle(songId) {
    await get().hydrate();
    const currentlyFavorite = get().songs.some((song) => song.id === songId);
    if (currentlyFavorite) {
      await removeFavoriteSong(songId);
      set((state) => ({
        songs: state.songs.filter((song) => song.id !== songId),
      }));
      favoritesCacheExpiresAt = Date.now() + FAVORITES_CACHE_TTL_MS;
      notifyFavoriteChanged(songId, false);
      return false;
    }

    await addFavoriteSong(songId);
    // The card/player may only have partial song metadata. Reloading preserves
    // one canonical Library list and puts the newly-liked song at the top.
    await get().hydrate(true);
    notifyFavoriteChanged(songId, true);
    return true;
  },
}));

if (typeof window !== "undefined") {
  subscribeFavoriteChanges((change) => {
    if (!change.remote) return;
    // A remote tab may not have the song's full projection locally. Reloading
    // the canonical paginated collection preserves ordering and metadata.
    void useFavoriteStore
      .getState()
      .hydrate(true)
      .catch(() => undefined);
  });
}

export function clearFavoriteStore() {
  hydrationVersion += 1;
  hydrationRequest = null;
  favoritesCacheExpiresAt = 0;
  useFavoriteStore.setState({
    songs: [],
    collection: undefined,
    loading: false,
    loaded: false,
  });
}

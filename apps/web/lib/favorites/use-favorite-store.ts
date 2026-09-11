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
import {
  optimisticallyAddLibraryResource,
  revalidateLibraryResources,
  rollbackOptimisticLibraryAddition,
} from "@/lib/library/library-resources.api";
import {
  isSuggestLessActive,
  setSuggestLess,
} from "@/lib/recommendations/suggest-less.api";

let hydrationRequest: Promise<void> | null = null;
let hydrationVersion = 0;
const FAVORITES_CACHE_TTL_MS = 3 * 60 * 1000;
const FAVORITES_PAGE_SIZE = 50;
let favoritesCacheExpiresAt = 0;

type FavoriteState = {
  songs: SongSummary[];
  songIds: Set<string>;
  collection?: FavoriteCollection;
  loading: boolean;
  loaded: boolean;
  hydrate: (force?: boolean) => Promise<void>;
  toggle: (songId: string, sourceAlbumId?: string) => Promise<boolean>;
};

export const useFavoriteStore = create<FavoriteState>((set, get) => ({
  songs: [],
  songIds: new Set(),
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
          songIds,
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
  async toggle(songId, sourceAlbumId) {
    await get().hydrate();
    const currentlyFavorite = get().songIds.has(songId);
    if (currentlyFavorite) {
      const previousSong = get().songs.find((song) => song.id === songId);
      set((state) => {
        const songIds = new Set(state.songIds);
        songIds.delete(songId);
        return {
          songs: state.songs.filter((song) => song.id !== songId),
          songIds,
        };
      });
      notifyFavoriteChanged(songId, false);
      try {
        await removeFavoriteSong(songId);
        favoritesCacheExpiresAt = Date.now() + FAVORITES_CACHE_TTL_MS;
        return false;
      } catch (error) {
        set((state) => {
          const songIds = new Set(state.songIds);
          songIds.add(songId);
          return {
            songs:
              previousSong && !state.songs.some((song) => song.id === songId)
                ? [previousSong, ...state.songs]
                : state.songs,
            songIds,
          };
        });
        notifyFavoriteChanged(songId, true);
        throw error;
      }
    }

    if (!sourceAlbumId) throw new Error("SOURCE_ALBUM_ID_REQUIRED");
    if (isSuggestLessActive("songs", songId)) {
      void setSuggestLess("songs", songId, false).catch(() => undefined);
    }
    const addedSongLibraryResource = optimisticallyAddLibraryResource({
      resourceType: "songs",
      resourceId: songId,
      sourceAlbumId,
    });
      const addedAlbumLibraryResource = optimisticallyAddLibraryResource({
      resourceType: "albums",
      resourceId: sourceAlbumId,
    });
    set((state) => {
      const songIds = new Set(state.songIds);
      songIds.add(songId);
      return { songIds };
    });
    notifyFavoriteChanged(songId, true);
    try {
      await addFavoriteSong(songId, sourceAlbumId);
      revalidateLibraryResources({
        resourceType: "songs",
        resourceId: songId,
        operation: "sync",
      });
      // The current surface only needs the id for its immediate state. Fetch
      // the canonical projection in the background for Favourite Songs.
      void get().hydrate(true).catch(() => undefined);
      return true;
    } catch (error) {
      set((state) => {
        const songIds = new Set(state.songIds);
        songIds.delete(songId);
        return { songIds };
      });
      rollbackOptimisticLibraryAddition(addedSongLibraryResource);
      rollbackOptimisticLibraryAddition(addedAlbumLibraryResource);
      notifyFavoriteChanged(songId, false);
      throw error;
    }
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
    songIds: new Set(),
    collection: undefined,
    loading: false,
    loaded: false,
  });
}

/** Applies a Library Album cascade without waiting for another favourites fetch. */
export function removeFavoriteSongsFromStore(songIds: string[]) {
  if (!songIds.length) return;
  const removedSongIds = new Set(songIds);
  useFavoriteStore.setState((state) => {
    const nextSongIds = new Set(state.songIds);
    for (const songId of removedSongIds) nextSongIds.delete(songId);
    return {
      songs: state.songs.filter((song) => !removedSongIds.has(song.id)),
      songIds: nextSongIds,
    };
  });
}

/** Restores optimistic Library deletion changes when the user chooses Undo. */
export function restoreFavoriteSongsToStore(songs: SongSummary[]) {
  if (!songs.length) return;
  useFavoriteStore.setState((state) => {
    const existingSongIds = new Set(state.songIds);
    const restoredSongs = songs.filter((song) => !existingSongIds.has(song.id));
    if (!restoredSongs.length) return state;
    for (const song of restoredSongs) existingSongIds.add(song.id);
    return {
      songs: [...restoredSongs, ...state.songs],
      songIds: existingSongIds,
    };
  });
}

import { librarySongKey } from "@/lib/library/library-song-key";
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
  isLibraryResourcePendingRemoval,
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
let sessionVersion = 0;
const pendingFavoriteChanges = new Map<string, boolean>();
const FAVORITES_CACHE_TTL_MS = 3 * 60 * 1000;
const FAVORITES_PAGE_SIZE = 50;
let favoritesCacheExpiresAt = 0;

type FavoriteState = {
  songs: SongSummary[];
  songKeys: Set<string>;
  collection?: FavoriteCollection;
  loading: boolean;
  loaded: boolean;
  hydrate: (force?: boolean) => Promise<void>;
  toggle: (songId: string, sourceAlbumId?: string) => Promise<boolean>;
};

export const useFavoriteStore = create<FavoriteState>((set, get) => ({
  songs: [],
  songKeys: new Set(),
  loading: false,
  loaded: false,
  async hydrate(force = false) {
    if (!force && hydrationRequest) return hydrationRequest;
    if (!force && get().loaded && Date.now() < favoritesCacheExpiresAt) {
      return;
    }

    const requestVersion = ++hydrationVersion;
    const showInitialLoading = !get().loaded;
    if (showInitialLoading) set({ loading: true });

    const request = (async () => {
      try {
        const songs: SongSummary[] = [];
        const songKeys = new Set<string>();
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
            const key = librarySongKey(song.id, song.albumId);
            if (songKeys.has(key)) continue;
            songKeys.add(key);
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

        const visibleSongs = songs.filter((song) => {
          if (!isLibraryResourcePendingRemoval("songs", song.id, song.albumId))
            return true;
          songKeys.delete(librarySongKey(song.id, song.albumId));
          return false;
        });
        for (const [key, favorite] of pendingFavoriteChanges) {
          if (favorite) songKeys.add(key);
          else songKeys.delete(key);
        }
        set({
          songs: visibleSongs.filter((song) =>
            songKeys.has(librarySongKey(song.id, song.albumId)),
          ),
          songKeys,
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
    if (!sourceAlbumId) throw new Error("SOURCE_ALBUM_ID_REQUIRED");
    const session = sessionVersion;
    await get().hydrate();
    if (session !== sessionVersion) return false;
    const key = librarySongKey(songId, sourceAlbumId);
    const currentlyFavorite = get().songKeys.has(key);
    hydrationVersion += 1;
    hydrationRequest = null;
    pendingFavoriteChanges.set(key, !currentlyFavorite);
    if (currentlyFavorite) {
      const previousSong = get().songs.find(
        (song) => librarySongKey(song.id, song.albumId) === key,
      );
      set((state) => {
        const songKeys = new Set(state.songKeys);
        songKeys.delete(key);
        return {
          songs: state.songs.filter(
            (song) => librarySongKey(song.id, song.albumId) !== key,
          ),
          songKeys,
        };
      });
      notifyFavoriteChanged(songId, false, sourceAlbumId, true);
      try {
        await removeFavoriteSong(songId, sourceAlbumId);
        if (session !== sessionVersion) return false;
        notifyFavoriteChanged(songId, false, sourceAlbumId);
        pendingFavoriteChanges.delete(key);
        hydrationVersion += 1;
        hydrationRequest = null;
        favoritesCacheExpiresAt = Date.now() + FAVORITES_CACHE_TTL_MS;
        return false;
      } catch (error) {
        if (session !== sessionVersion) throw error;
        pendingFavoriteChanges.delete(key);
        set((state) => {
          const songKeys = new Set(state.songKeys);
          songKeys.add(key);
          return {
            songs:
              previousSong &&
              !state.songs.some(
                (song) => librarySongKey(song.id, song.albumId) === key,
              )
                ? [previousSong, ...state.songs]
                : state.songs,
            songKeys,
          };
        });
        notifyFavoriteChanged(songId, true, sourceAlbumId);
        throw error;
      }
    }

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
      const songKeys = new Set(state.songKeys);
      songKeys.add(key);
      return { songKeys };
    });
    notifyFavoriteChanged(songId, true, sourceAlbumId, true);
    try {
      await addFavoriteSong(songId, sourceAlbumId);
      if (session !== sessionVersion) return false;
      notifyFavoriteChanged(songId, true, sourceAlbumId);
      pendingFavoriteChanges.delete(key);
      revalidateLibraryResources({
        resourceType: "songs",
        resourceId: songId,
        operation: "sync",
      });
      // The current surface only needs the id for its immediate state. Fetch
      // the canonical projection in the background for Favourite Songs.
      void get()
        .hydrate(true)
        .catch(() => undefined);
      return true;
    } catch (error) {
      if (session !== sessionVersion) throw error;
      pendingFavoriteChanges.delete(key);
      set((state) => {
        const songKeys = new Set(state.songKeys);
        songKeys.delete(key);
        return {
          songKeys,
          songs: state.songs.filter(
            (song) => librarySongKey(song.id, song.albumId) !== key,
          ),
        };
      });
      rollbackOptimisticLibraryAddition(addedSongLibraryResource);
      rollbackOptimisticLibraryAddition(addedAlbumLibraryResource);
      notifyFavoriteChanged(songId, false, sourceAlbumId);
      throw error;
    }
  },
}));

if (typeof window !== "undefined") {
  subscribeFavoriteChanges((change) => {
    if (!change.remote) return;
    if (change.pending) return;
    // A remote tab may not have the song's full projection locally. Reloading
    // the canonical paginated collection preserves ordering and metadata.
    void useFavoriteStore
      .getState()
      .hydrate(true)
      .catch(() => undefined);
  });
}

export function clearFavoriteStore() {
  sessionVersion += 1;
  hydrationVersion += 1;
  hydrationRequest = null;
  favoritesCacheExpiresAt = 0;
  pendingFavoriteChanges.clear();
  useFavoriteStore.setState({
    songs: [],
    songKeys: new Set(),
    collection: undefined,
    loading: false,
    loaded: false,
  });
}

/** Applies a Library Album cascade without waiting for another favourites fetch. */
export function removeFavoriteSongsFromStore(
  songIds: string[],
  sourceAlbumId: string,
) {
  const songKeys = songIds.map((id) => librarySongKey(id, sourceAlbumId));
  if (!songKeys.length) return;
  hydrationVersion += 1;
  hydrationRequest = null;
  const removedKeys = new Set(songKeys);
  useFavoriteStore.setState((state) => {
    const nextKeys = new Set(state.songKeys);
    for (const key of removedKeys) nextKeys.delete(key);
    return {
      songs: state.songs.filter(
        (song) => !removedKeys.has(librarySongKey(song.id, song.albumId)),
      ),
      songKeys: nextKeys,
    };
  });
}

/** Restores optimistic Library deletion changes when the user chooses Undo. */
export function restoreFavoriteSongsToStore(songs: SongSummary[]) {
  if (!songs.length) return;
  hydrationVersion += 1;
  hydrationRequest = null;
  useFavoriteStore.setState((state) => {
    const existingKeys = new Set(state.songKeys);
    const restoredSongs = songs.filter(
      (song) => !existingKeys.has(librarySongKey(song.id, song.albumId)),
    );
    if (!restoredSongs.length) return state;
    for (const song of restoredSongs)
      existingKeys.add(librarySongKey(song.id, song.albumId));
    return {
      songs: [...restoredSongs, ...state.songs],
      songKeys: existingKeys,
    };
  });
}

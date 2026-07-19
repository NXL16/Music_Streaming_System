import { create } from "zustand";
import {
  addFavoriteSong,
  listFavoriteSongs,
  removeFavoriteSong,
} from "@/lib/songs/song.api";
import type { SongSummary } from "@/lib/songs/song.types";

type FavoriteState = {
  songs: SongSummary[];
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
    if (get().loading || (get().loaded && !force)) return;
    set({ loading: true });
    try {
      const response = await listFavoriteSongs({ limit: 50 });
      set({ songs: response.songs ?? [], loaded: true });
    } finally {
      set({ loading: false });
    }
  },
  async toggle(songId) {
    await get().hydrate();
    const currentlyFavorite = get().songs.some((song) => song.id === songId);
    if (currentlyFavorite) {
      await removeFavoriteSong(songId);
      set((state) => ({ songs: state.songs.filter((song) => song.id !== songId) }));
      return false;
    }

    await addFavoriteSong(songId);
    // The card/player may only have partial song metadata. Reloading preserves
    // one canonical Library list and puts the newly-liked song at the top.
    await get().hydrate(true);
    return true;
  },
}));

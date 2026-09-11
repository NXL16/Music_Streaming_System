import { create } from "zustand";
import {
  listPlaylistFavoriteIds,
  subscribePlaylistFavoriteChanges,
} from "./playlist-favorite.api";

type PlaylistFavoriteState = {
  playlistIds: Set<string>;
  resolvedPlaylistIds: Set<string>;
  localOverrides: Map<string, boolean>;
  loaded: boolean;
  loading: boolean;
  hydrate: (force?: boolean) => Promise<void>;
};

let hydrationRequest: Promise<void> | null = null;
let hydrationVersion = 0;

export const usePlaylistFavoriteStore = create<PlaylistFavoriteState>(
  (set, get) => ({
    playlistIds: new Set(),
    resolvedPlaylistIds: new Set(),
    localOverrides: new Map(),
    loaded: false,
    loading: false,
    async hydrate(force = false) {
      if (!force && get().loaded) return;
      if (!force && hydrationRequest) return hydrationRequest;

      const requestVersion = ++hydrationVersion;
      const request = (async () => {
        set({ loading: true });
        try {
          const playlistIds = await listPlaylistFavoriteIds();
          if (requestVersion !== hydrationVersion) return;
          const localOverrides = get().localOverrides;
          const nextPlaylistIds = new Set(playlistIds);
          for (const [playlistId, isFavorite] of localOverrides) {
            if (isFavorite) nextPlaylistIds.add(playlistId);
            else nextPlaylistIds.delete(playlistId);
          }
          set({
            playlistIds: nextPlaylistIds,
            resolvedPlaylistIds: new Set([
              ...playlistIds,
              ...localOverrides.keys(),
            ]),
            loaded: true,
          });
        } finally {
          if (requestVersion !== hydrationVersion) return;
          hydrationRequest = null;
          set({ loading: false });
        }
      })();
      hydrationRequest = request;
      return request;
    },
  }),
);

if (typeof window !== "undefined") {
  subscribePlaylistFavoriteChanges(({ playlistId, isFavorite }) => {
    hydrationVersion += 1;
    hydrationRequest = null;
    usePlaylistFavoriteStore.setState((state) => {
      const playlistIds = new Set(state.playlistIds);
      const resolvedPlaylistIds = new Set(state.resolvedPlaylistIds);
      const localOverrides = new Map(state.localOverrides);
      if (isFavorite) playlistIds.add(playlistId);
      else playlistIds.delete(playlistId);
      resolvedPlaylistIds.add(playlistId);
      localOverrides.set(playlistId, isFavorite);
      return {
        playlistIds,
        resolvedPlaylistIds,
        localOverrides,
        loading: false,
      };
    });
  });
}

export function clearPlaylistFavoriteStore() {
  hydrationVersion += 1;
  hydrationRequest = null;
  usePlaylistFavoriteStore.setState({
    playlistIds: new Set(),
    resolvedPlaylistIds: new Set(),
    localOverrides: new Map(),
    loaded: false,
    loading: false,
  });
}

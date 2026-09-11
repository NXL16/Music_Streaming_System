import { create } from 'zustand';
import {
  listAlbumFavoriteIds,
  subscribeAlbumFavoriteChanges,
} from './album-favorite.api';

type AlbumFavoriteState = {
  albumIds: Set<string>;
  resolvedAlbumIds: Set<string>;
  localOverrides: Map<string, boolean>;
  loaded: boolean;
  loading: boolean;
  hydrate: (force?: boolean) => Promise<void>;
};

let hydrationRequest: Promise<void> | null = null;
let hydrationVersion = 0;

export const useAlbumFavoriteStore = create<AlbumFavoriteState>((set, get) => ({
  albumIds: new Set(),
  resolvedAlbumIds: new Set(),
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
        const albumIds = await listAlbumFavoriteIds();
        if (requestVersion !== hydrationVersion) return;
        const localOverrides = get().localOverrides;
        const nextAlbumIds = new Set(albumIds);
        for (const [albumId, isFavorite] of localOverrides) {
          if (isFavorite) nextAlbumIds.add(albumId);
          else nextAlbumIds.delete(albumId);
        }
        set({
          albumIds: nextAlbumIds,
          resolvedAlbumIds: new Set([...albumIds, ...localOverrides.keys()]),
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
}));

if (typeof window !== 'undefined') {
  subscribeAlbumFavoriteChanges(({ albumId, isFavorite }) => {
    hydrationVersion += 1;
    hydrationRequest = null;
    useAlbumFavoriteStore.setState((state) => {
      const albumIds = new Set(state.albumIds);
      const resolvedAlbumIds = new Set(state.resolvedAlbumIds);
      const localOverrides = new Map(state.localOverrides);
      if (isFavorite) albumIds.add(albumId);
      else albumIds.delete(albumId);
      resolvedAlbumIds.add(albumId);
      localOverrides.set(albumId, isFavorite);
      return { albumIds, resolvedAlbumIds, localOverrides, loading: false };
    });
  });
}

export function clearAlbumFavoriteStore() {
  hydrationVersion += 1;
  hydrationRequest = null;
  useAlbumFavoriteStore.setState({
    albumIds: new Set(),
    resolvedAlbumIds: new Set(),
    localOverrides: new Map(),
    loaded: false,
    loading: false,
  });
}

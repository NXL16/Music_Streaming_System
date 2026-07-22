"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { developmentCacheDisabled } from "@/lib/config/development-cache";
import {
  getCatalogArtist,
  getCatalogArtistAlbums,
} from "./catalog.api";
import { getCatalogArtistSongPage } from "./artist-song-pages";
import type {
  CatalogArtistResource,
  CatalogAlbumResource,
} from "./catalog.types";
import type { PlayerSong } from "@/lib/player/use-player-store";

const CACHE_TTL_MS = 2 * 60 * 1000;
const MAX_CACHE_ENTRIES = 12;

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const artistCache = new Map<string, CacheEntry<CatalogArtistResource | null>>();
const albumCache = new Map<string, CacheEntry<CatalogAlbumResource[]>>();
const pendingArtistRequests = new Map<
  string,
  Promise<CatalogArtistResource | null>
>();
const pendingAlbumRequests = new Map<string, Promise<CatalogAlbumResource[]>>();

type UseCatalogArtistOptions = {
  includeAlbums?: boolean;
  includeSongs?: boolean;
};

function getCachedValue<T>(cache: Map<string, CacheEntry<T>>, key: string) {
  if (developmentCacheDisabled) return undefined;
  const cached = cache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) {
    if (cached) cache.delete(key);
    return undefined;
  }

  cache.delete(key);
  cache.set(key, cached);
  return cached.value;
}

function cacheValue<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
) {
  if (developmentCacheDisabled) return;
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });

  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

function loadCached<T>(
  cache: Map<string, CacheEntry<T>>,
  pendingRequests: Map<string, Promise<T>>,
  key: string,
  load: () => Promise<T>,
  force = false,
) {
  if (force) cache.delete(key);

  const cached = getCachedValue(cache, key);
  if (cached !== undefined) return Promise.resolve(cached);

  const pending = pendingRequests.get(key);
  if (pending) return pending;

  const request = load()
    .then((value) => {
      cacheValue(cache, key, value);
      return value;
    })
    .finally(() => {
      pendingRequests.delete(key);
    });

  pendingRequests.set(key, request);
  return request;
}

function getCachedArtistDetail(artistId: string, force = false) {
  return loadCached(
    artistCache,
    pendingArtistRequests,
    artistId,
    async () => {
      const response = await getCatalogArtist(artistId);
      return response.resources.artists[artistId] || null;
    },
    force,
  );
}

function getCachedArtistAlbums(artistId: string, force = false) {
  return loadCached(
    albumCache,
    pendingAlbumRequests,
    artistId,
    async () => {
      const response = await getCatalogArtistAlbums(artistId);
      return Object.values(response.resources.albums || {}).sort(
        (left, right) => {
          const dateL = left.attributes?.releaseDate
            ? new Date(left.attributes.releaseDate).getTime()
            : 0;
          const dateR = right.attributes?.releaseDate
            ? new Date(right.attributes.releaseDate).getTime()
            : 0;
          return dateR - dateL;
        },
      );
    },
    force,
  );
}

function getCachedArtistSongs(artistId: string, force = false) {
  return getCatalogArtistSongPage(artistId, { force }).then((page) => page.songs);
}

export function useCatalogArtist(
  artistId: string,
  { includeAlbums = true, includeSongs = true }: UseCatalogArtistOptions = {},
) {
  const [artist, setArtist] = useState<CatalogArtistResource | null>(null);
  const [albums, setAlbums] = useState<CatalogAlbumResource[]>([]);
  const [songs, setSongs] = useState<PlayerSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(
    async (force = false) => {
      const [artistDetail, songList, albumList] = await Promise.all([
        getCachedArtistDetail(artistId, force),
        includeSongs
          ? getCachedArtistSongs(artistId, force)
          : Promise.resolve([]),
        includeAlbums
          ? getCachedArtistAlbums(artistId, force)
          : Promise.resolve([]),
      ]);

      return {
        artistDetail,
        albumList,
        songList,
      };
    },
    [artistId, includeAlbums, includeSongs],
  );

  useEffect(() => {
    const controller = new AbortController();

    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setLoading(true);
      setError("");

      fetchData()
        .then(({ artistDetail, albumList, songList }) => {
          if (!controller.signal.aborted) {
            setArtist(artistDetail);
            setAlbums(albumList);
            setSongs(songList);
            setError("");
          }
        })
        .catch((requestError: unknown) => {
          if (!controller.signal.aborted) {
            setError(
              getApiErrorMessage(
                requestError,
                "Không thể tải nội dung thông tin nghệ sĩ.",
              ),
            );
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    });

    return () => controller.abort();
  }, [fetchData]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { artistDetail, albumList, songList } = await fetchData(true);
      setArtist(artistDetail);
      setAlbums(albumList);
      setSongs(songList);
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          "Không thể tải nội dung thông tin nghệ sĩ.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [fetchData]);

  return {
    artist,
    albums,
    songs,
    loading,
    error,
    reload,
  };
}

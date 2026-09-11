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
import { useMinimumLoadingState } from "@/lib/loading/use-minimum-loading-duration";
import { HOME_SHELF_PREVIEW_LIMIT } from "@musical/shared-constants";

const CACHE_TTL_MS = 2 * 60 * 1000;
const MAX_CACHE_ENTRIES = 12;

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const artistCache = new Map<string, CacheEntry<CatalogArtistResource | null>>();
export type CatalogArtistAlbumSectionData = {
  albums: CatalogAlbumResource[];
  artistResources: Record<string, CatalogArtistResource>;
};

const albumCache = new Map<
  string,
  CacheEntry<CatalogArtistAlbumSectionData>
>();
const pendingArtistRequests = new Map<
  string,
  Promise<CatalogArtistResource | null>
>();
const pendingAlbumRequests = new Map<
  string,
  Promise<CatalogArtistAlbumSectionData>
>();

type UseCatalogArtistOptions = {
  includeAlbums?: boolean;
  includeSongs?: boolean;
};

type ArtistAlbumReleaseType = "album" | "ep" | "single";
type ArtistAlbumSection = "albums" | "singlesAndEps" | "appearsOn";

const ARTIST_ALBUM_SECTION_OPTIONS: Record<
  ArtistAlbumSection,
  {
    releaseTypes?: ArtistAlbumReleaseType[];
    section?: "appears-on";
  }
> = {
  albums: { releaseTypes: ["album"] },
  singlesAndEps: { releaseTypes: ["single", "ep"] },
  appearsOn: { section: "appears-on" },
};
const ARTIST_ALBUM_PREVIEW_FETCH_LIMIT = HOME_SHELF_PREVIEW_LIMIT + 1;

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

function getCachedArtistAlbums(
  artistId: string,
  options: {
    limit?: number;
    releaseTypes?: ArtistAlbumReleaseType[];
    section?: "appears-on";
  } = {},
  force = false,
) {
  const key = `${artistId}:${options.section ?? "discography"}:${options.limit ?? "all"}:${(
    options.releaseTypes ?? []
  ).join(",")}`;
  return loadCached(
    albumCache,
    pendingAlbumRequests,
    key,
    async () => {
      const response = await getCatalogArtistAlbums(artistId, options);
      return {
        albums: Object.values(response.resources.albums || {}).sort(
          (left, right) => {
            const dateL = left.attributes?.releaseDate
              ? new Date(left.attributes.releaseDate).getTime()
              : 0;
            const dateR = right.attributes?.releaseDate
              ? new Date(right.attributes.releaseDate).getTime()
              : 0;
            return dateR - dateL;
          },
        ),
        artistResources: response.resources.artists,
      };
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
  const [albumSections, setAlbumSections] = useState<
    Record<ArtistAlbumSection, CatalogArtistAlbumSectionData>
  >({
    albums: { albums: [], artistResources: {} },
    singlesAndEps: { albums: [], artistResources: {} },
    appearsOn: { albums: [], artistResources: {} },
  });
  const [songs, setSongs] = useState<PlayerSong[]>([]);
  const [loading, setLoading] = useMinimumLoadingState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(
    async (force = false) => {
      const [artistDetail, songList, albumLists] = await Promise.all([
        getCachedArtistDetail(artistId, force),
        includeSongs
          ? getCachedArtistSongs(artistId, force)
          : Promise.resolve([]),
        includeAlbums
          ? Promise.all(
              (Object.keys(ARTIST_ALBUM_SECTION_OPTIONS) as ArtistAlbumSection[]).map(
                (section) =>
                  getCachedArtistAlbums(
                    artistId,
                    {
                      limit: ARTIST_ALBUM_PREVIEW_FETCH_LIMIT,
                      ...ARTIST_ALBUM_SECTION_OPTIONS[section],
                    },
                    force,
                  ),
              ),
            )
          : Promise.resolve(
              [
                { albums: [], artistResources: {} },
                { albums: [], artistResources: {} },
                { albums: [], artistResources: {} },
              ] as CatalogArtistAlbumSectionData[],
            ),
      ]);

      const nextAlbumSections = {
        albums: albumLists[0],
        singlesAndEps: albumLists[1],
        appearsOn: albumLists[2],
      };

      return {
        artistDetail,
        albumList: [
          ...nextAlbumSections.albums.albums,
          ...nextAlbumSections.singlesAndEps.albums,
        ]
          .sort((left, right) => {
            const dateL = left.attributes.releaseDate
              ? new Date(left.attributes.releaseDate).getTime()
              : 0;
            const dateR = right.attributes.releaseDate
              ? new Date(right.attributes.releaseDate).getTime()
              : 0;
            return dateR - dateL;
          }),
        albumSections: nextAlbumSections,
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
        .then(({ artistDetail, albumList, albumSections, songList }) => {
          if (!controller.signal.aborted) {
            setArtist(artistDetail);
            setAlbums(albumList);
            setAlbumSections(albumSections);
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
  }, [fetchData, setLoading]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { artistDetail, albumList, albumSections, songList } =
        await fetchData(true);
      setArtist(artistDetail);
      setAlbums(albumList);
      setAlbumSections(albumSections);
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
  }, [fetchData, setLoading]);

  const loadAlbumSection = useCallback(
    (section: ArtistAlbumSection) =>
      getCachedArtistAlbums(artistId, {
        ...ARTIST_ALBUM_SECTION_OPTIONS[section],
      }),
    [artistId],
  );

  return {
    artist,
    albums,
    albumSections,
    songs,
    loading,
    error,
    reload,
    loadAlbumSection,
  };
}

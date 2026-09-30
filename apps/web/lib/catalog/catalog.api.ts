import { http } from "@/lib/api/http";
import { developmentCacheDisabled } from "@/lib/config/development-cache";
import { hydrateCatalogMediaEntities } from "./hydrate-catalog-media-entities";
import { invalidateAllMediaEntities } from "@/lib/media/media-entity-store";
import { notifyHomeRecommendationsStale } from "@/lib/recommendations/home-revalidation";
import type {
  CatalogArtistSongsPage,
  CatalogAlbumRelatedResponse,
  CatalogReference,
  CatalogResponse,
} from "./catalog.types";

const STOREFRONT = process.env.NEXT_PUBLIC_STOREFRONT || "vn";
const RESOURCE_CACHE_TTL_MS = 2 * 60 * 1000;
const MAX_RESOURCE_CACHE_ENTRIES = 100;
const MAX_DETAIL_CACHE_ENTRIES = 100;

type ResourceCacheEntry = {
  expiresAt: number;
  value: CatalogResponse;
};

const resourceCache = new Map<string, ResourceCacheEntry>();
const detailCache = new Map<string, ResourceCacheEntry>();
type PendingCatalogRequest = {
  promise: Promise<CatalogResponse>;
  controller: AbortController;
};
const pendingResourceRequests = new Map<string, PendingCatalogRequest>();
const pendingDetailRequests = new Map<string, PendingCatalogRequest>();
let cacheGeneration = 0;

function pruneCatalogCache(
  cache: Map<string, ResourceCacheEntry>,
  now: number,
) {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

function getCatalogCacheEntry(
  cache: Map<string, ResourceCacheEntry>,
  key: string,
  now: number,
) {
  pruneCatalogCache(cache, now);
  const entry = cache.get(key);
  if (!entry) return undefined;

  // Map preserves insertion order, so re-inserting promotes this entry to MRU.
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

function setCatalogCacheEntry(
  cache: Map<string, ResourceCacheEntry>,
  key: string,
  value: CatalogResponse,
  maxEntries: number,
) {
  const now = Date.now();
  pruneCatalogCache(cache, now);
  cache.delete(key);
  cache.set(key, { value, expiresAt: now + RESOURCE_CACHE_TTL_MS });

  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

function resourceCacheKey(
  resources: Array<Pick<CatalogReference, "id" | "type">>,
) {
  return resources
    .map((resource) => `${resource.type}:${resource.id}`)
    .sort()
    .join("|");
}

/**
 * Shares identical batch hydrations across callers and keeps a short-lived
 * entity snapshot. Requests that need AbortSignal semantics bypass this cache.
 */
function getCachedCatalogResources(
  resources: Array<Pick<CatalogReference, "id" | "type">>,
) {
  const key = resourceCacheKey(resources);
  const now = Date.now();
  const cached = developmentCacheDisabled
    ? undefined
    : getCatalogCacheEntry(resourceCache, key, now);
  if (cached) {
    return Promise.resolve(cached);
  }

  const pending = pendingResourceRequests.get(key);
  if (pending) return pending.promise;

  const requestGeneration = cacheGeneration;
  const controller = new AbortController();
  const request = http
    .post<CatalogResponse>(`/catalog/${STOREFRONT}/resources`, { resources }, {
      signal: controller.signal,
    })
    .then((response) => {
      if (requestGeneration === cacheGeneration) {
        if (!developmentCacheDisabled) {
          setCatalogCacheEntry(
            resourceCache,
            key,
            response.data,
            MAX_RESOURCE_CACHE_ENTRIES,
          );
        }
        return hydrateCatalogMediaEntities(response.data);
      }

      // Invalidated requests can still resolve in transports that do not
      // honor abort immediately. Return their payload to the original caller
      // without restoring stale entities into the shared store.
      return response.data;
    })
    .finally(() => {
      if (pendingResourceRequests.get(key)?.promise === request) {
        pendingResourceRequests.delete(key);
      }
    });

  pendingResourceRequests.set(key, { promise: request, controller });
  return request;
}

function getCachedCatalogDetail(
  key: string,
  request: (signal: AbortSignal) => Promise<CatalogResponse>,
) {
  const cached = developmentCacheDisabled
    ? undefined
    : getCatalogCacheEntry(detailCache, key, Date.now());
  if (cached) {
    return Promise.resolve(cached);
  }

  const pending = pendingDetailRequests.get(key);
  if (pending) return pending.promise;

  const requestGeneration = cacheGeneration;
  const controller = new AbortController();
  const pendingRequest = request(controller.signal)
    .then((response) => {
      if (requestGeneration === cacheGeneration) {
        const hydrated = hydrateCatalogMediaEntities(response);
        if (!developmentCacheDisabled) {
          setCatalogCacheEntry(
            detailCache,
            key,
            hydrated,
            MAX_DETAIL_CACHE_ENTRIES,
          );
        }
        return hydrated;
      }

      return response;
    })
    .finally(() => {
      if (pendingDetailRequests.get(key)?.promise === pendingRequest) {
        pendingDetailRequests.delete(key);
      }
    });
  pendingDetailRequests.set(key, { promise: pendingRequest, controller });
  return pendingRequest;
}

function abortPendingCatalogRequests(
  requests: Map<string, PendingCatalogRequest>,
) {
  for (const { controller } of requests.values()) controller.abort();
  requests.clear();
}

function getCatalogDetail(
  cacheKey: string,
  path: string,
  signal?: AbortSignal,
) {
  const request = (requestSignal?: AbortSignal) =>
    http
      .get<CatalogResponse>(path, { signal: requestSignal })
      .then((response) => response.data);

  // A caller that owns cancellation must never receive a shared request.
  return signal
    ? request(signal).then(hydrateCatalogMediaEntities)
    : getCachedCatalogDetail(cacheKey, request);
}

export function invalidateCatalogResourceCache() {
  cacheGeneration += 1;
  resourceCache.clear();
  detailCache.clear();
  abortPendingCatalogRequests(pendingResourceRequests);
  abortPendingCatalogRequests(pendingDetailRequests);
  invalidateAllMediaEntities();
}

export async function getCatalogAlbum(albumId: string, signal?: AbortSignal) {
  return getCatalogDetail(
    `albums:${albumId}`,
    `/catalog/${STOREFRONT}/albums/${encodeURIComponent(albumId)}`,
    signal,
  );
}

export async function getCatalogReleaseTrack(
  releaseTrackId: string,
  signal?: AbortSignal,
) {
  return getCatalogDetail(
    `release-tracks:${releaseTrackId}`,
    `/catalog/${STOREFRONT}/release-tracks/${encodeURIComponent(releaseTrackId)}`,
    signal,
  );
}

export async function getCatalogAlbumRelated(
  albumId: string,
  options: {
    section?: string;
    cursor?: string;
    limit?: number;
    sourceSongId?: string;
  } = {},
  signal?: AbortSignal,
) {
  const response = await http.get<CatalogAlbumRelatedResponse>(
    `/catalog/${STOREFRONT}/albums/${encodeURIComponent(albumId)}/related`,
    { params: options, signal },
  );
  hydrateCatalogMediaEntities(response.data.moreBy);
  hydrateCatalogMediaEntities(response.data.featuredOn);
  hydrateCatalogMediaEntities(response.data.youMightAlsoLike);
  return response.data;
}

export async function getCatalogPlaylist(
  playlistId: string,
  signal?: AbortSignal,
) {
  const catalog = await getCatalogDetail(
    `playlists:${playlistId}`,
    `/catalog/${STOREFRONT}/playlists/${encodeURIComponent(playlistId)}`,
    signal,
  );
  const root = catalog.data.find((resource) => resource.type === "playlists");
  const playlist = root ? catalog.resources.playlists[root.id] : undefined;
  if (!root || playlist?.attributes.playlistType !== "system-personalized") {
    return catalog;
  }

  // There are only three catalog playlists. For these cards the identity and
  // URL stay global, while this authenticated endpoint supplies the current
  // listener's cached recommendation order.
  const trackIds = await getPersonalizedSystemPlaylistTrackIds(
    playlistId,
    signal,
  ).catch(() => []);
  if (trackIds.length === 0) return catalog;

  const tracks = await getCatalogResources(
    trackIds.map((id) => ({ id, type: "songs" })),
    signal,
  );
  const trackRefs = trackIds
    .filter((id) => Boolean(tracks.resources.songs[id]))
    .map((id) => ({ id, type: "songs", href: `/catalog/${STOREFRONT}/songs/${id}` }));
  if (trackRefs.length === 0) return catalog;

  return {
    data: [root, ...trackRefs],
    resources: {
      ...catalog.resources,
      songs: { ...catalog.resources.songs, ...tracks.resources.songs },
      artists: { ...catalog.resources.artists, ...tracks.resources.artists },
      albums: { ...catalog.resources.albums, ...tracks.resources.albums },
      playlists: {
        ...catalog.resources.playlists,
        [root.id]: {
          ...playlist,
          relationships: {
            ...playlist.relationships,
            tracks: { href: "", data: trackRefs },
          },
        },
      },
    },
  };
}

async function getPersonalizedSystemPlaylistTrackIds(
  playlistId: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const response = await http.get<{ trackIds?: unknown }>(
    `/me/recommendations/system-playlists/${encodeURIComponent(playlistId)}/tracks`,
    { signal },
  );
  return Array.isArray(response.data.trackIds)
    ? response.data.trackIds.filter((id): id is string => typeof id === "string")
    : [];
}

export async function getCatalogResources(
  resources: Array<Pick<CatalogReference, "id" | "type">>,
  signal?: AbortSignal,
) {
  if (!signal) return getCachedCatalogResources(resources);

  const response = await http.post<CatalogResponse>(
    `/catalog/${STOREFRONT}/resources`,
    { resources },
    { signal },
  );
  return hydrateCatalogMediaEntities(response.data);
}

export type CatalogSearchOptions = {
  types?: Array<"songs" | "artists" | "albums" | "playlists">;
};

export async function searchCatalog(
  query: string,
  options: CatalogSearchOptions = {},
  signal?: AbortSignal,
) {
  const response = await http.get<CatalogResponse>(
    `/catalog/${STOREFRONT}/search`,
    {
      params: {
        q: query,
        ...(options.types?.length ? { types: options.types.join(",") } : {}),
      },
      signal,
    },
  );
  return hydrateCatalogMediaEntities(response.data);
}

export async function recordCatalogSearchClick(
  resourceType: string,
  resourceId: string,
) {
  await http.post(`/catalog/${STOREFRONT}/search/click`, {
    resourceType,
    resourceId,
  });
  notifyHomeRecommendationsStale();
}

export async function getCatalogArtist(artistId: string, signal?: AbortSignal) {
  return getCatalogDetail(
    `artists:${artistId}`,
    `/catalog/${STOREFRONT}/artists/${encodeURIComponent(artistId)}`,
    signal,
  );
}

export async function getCatalogArtistAlbums(
  artistId: string,
  options: {
    limit?: number;
    releaseTypes?: Array<"album" | "ep" | "single">;
    section?: "appears-on";
  } = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.releaseTypes?.length) {
    params.set("releaseType", options.releaseTypes.join(","));
  }
  if (options.section) params.set("section", options.section);
  const query = params.size > 0 ? `?${params.toString()}` : "";
  const response = await http.get<CatalogResponse>(
    `/catalog/${STOREFRONT}/artists/${encodeURIComponent(artistId)}/albums${query}`,
    { signal },
  );
  return hydrateCatalogMediaEntities(response.data);
}

export async function getCatalogArtistSongs(
  artistId: string,
  {
    cursor,
    limit = 20,
    signal,
  }: {
    cursor?: string;
    limit?: number;
    signal?: AbortSignal;
  } = {},
) {
  const response = await http.get<CatalogArtistSongsPage>(
    `/catalog/${STOREFRONT}/artists/${encodeURIComponent(artistId)}/songs`,
    {
      params: {
        ...(cursor ? { cursor } : {}),
        limit,
      },
      signal,
    },
  );
  hydrateCatalogMediaEntities(response.data);
  return response.data;
}

export async function getCatalogSimilarArtists(
  artistId: string,
  { limit = 10, signal }: { limit?: number; signal?: AbortSignal } = {},
) {
  const response = await http.get<CatalogResponse>(
    `/catalog/${STOREFRONT}/artists/${encodeURIComponent(artistId)}/similar`,
    { params: { limit }, signal },
  );
  return hydrateCatalogMediaEntities(response.data);
}

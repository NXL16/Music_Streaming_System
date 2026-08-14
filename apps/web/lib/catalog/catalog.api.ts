import { http } from "@/lib/api/http";
import { developmentCacheDisabled } from "@/lib/config/development-cache";
import { hydrateCatalogMediaEntities } from "./hydrate-catalog-media-entities";
import { invalidateAllMediaEntities } from "@/lib/media/media-entity-store";
import type {
  CatalogArtistSongsPage,
  CatalogAlbumRelatedResponse,
  CatalogReference,
  CatalogResponse,
} from "./catalog.types";

const STOREFRONT = process.env.NEXT_PUBLIC_STOREFRONT || "vn";
const RESOURCE_CACHE_TTL_MS = 2 * 60 * 1000;

type ResourceCacheEntry = {
  expiresAt: number;
  value: CatalogResponse;
};

const resourceCache = new Map<string, ResourceCacheEntry>();
const pendingResourceRequests = new Map<string, Promise<CatalogResponse>>();
const detailCache = new Map<string, ResourceCacheEntry>();
const pendingDetailRequests = new Map<string, Promise<CatalogResponse>>();

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
  const cached = resourceCache.get(key);
  if (!developmentCacheDisabled && cached && cached.expiresAt > now) {
    return Promise.resolve(cached.value);
  }

  const pending = pendingResourceRequests.get(key);
  if (pending) return pending;

  const request = http
    .post<CatalogResponse>(`/catalog/${STOREFRONT}/resources`, { resources })
    .then((response) => {
      if (!developmentCacheDisabled) {
        resourceCache.set(key, {
          value: response.data,
          expiresAt: Date.now() + RESOURCE_CACHE_TTL_MS,
        });
      }
      return hydrateCatalogMediaEntities(response.data);
    })
    .finally(() => {
      pendingResourceRequests.delete(key);
    });

  pendingResourceRequests.set(key, request);
  return request;
}

function getCachedCatalogDetail(
  key: string,
  request: () => Promise<CatalogResponse>,
) {
  const cached = detailCache.get(key);
  if (!developmentCacheDisabled && cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.value);
  }

  const pending = pendingDetailRequests.get(key);
  if (pending) return pending;

  const pendingRequest = request()
    .then((response) => {
      const hydrated = hydrateCatalogMediaEntities(response);
      if (!developmentCacheDisabled) {
        detailCache.set(key, {
          value: hydrated,
          expiresAt: Date.now() + RESOURCE_CACHE_TTL_MS,
        });
      }
      return hydrated;
    })
    .finally(() => {
      pendingDetailRequests.delete(key);
    });
  pendingDetailRequests.set(key, pendingRequest);
  return pendingRequest;
}

function getCatalogDetail(
  cacheKey: string,
  path: string,
  signal?: AbortSignal,
) {
  const request = () =>
    http
      .get<CatalogResponse>(path, { signal })
      .then((response) => response.data);

  // A caller that owns cancellation must never receive a shared request.
  return signal
    ? request().then(hydrateCatalogMediaEntities)
    : getCachedCatalogDetail(cacheKey, request);
}

export function invalidateCatalogResourceCache() {
  resourceCache.clear();
  detailCache.clear();
  pendingDetailRequests.clear();
  invalidateAllMediaEntities();
}

export async function getCatalogAlbum(albumId: string, signal?: AbortSignal) {
  return getCatalogDetail(
    `albums:${albumId}`,
    `/catalog/${STOREFRONT}/albums/${encodeURIComponent(albumId)}`,
    signal,
  );
}

export async function getCatalogAlbumRelated(
  albumId: string,
  options: { section?: string; cursor?: string; limit?: number } = {},
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
  return getCatalogDetail(
    `playlists:${playlistId}`,
    `/catalog/${STOREFRONT}/playlists/${encodeURIComponent(playlistId)}`,
    signal,
  );
}

export async function getCatalogPlaylistTracks(
  playlistId: string,
  signal?: AbortSignal,
) {
  const response = await http.get<CatalogResponse>(
    `/catalog/${STOREFRONT}/playlists/${encodeURIComponent(playlistId)}/tracks`,
    { signal },
  );
  return hydrateCatalogMediaEntities(response.data);
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

export async function searchCatalog(query: string, signal?: AbortSignal) {
  const response = await http.get<CatalogResponse>(
    `/catalog/${STOREFRONT}/search`,
    {
      params: { q: query },
      signal,
    },
  );
  return hydrateCatalogMediaEntities(response.data);
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
  signal?: AbortSignal,
) {
  const response = await http.get<CatalogResponse>(
    `/catalog/${STOREFRONT}/artists/${encodeURIComponent(artistId)}/albums`,
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

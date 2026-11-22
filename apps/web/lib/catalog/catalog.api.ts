import { http } from "@/lib/api/http";
import { useAuthStore } from "@/lib/auth/auth-store";
import { normalizeCatalogSearchQuery } from "@musical/shared-constants";
import {
  createQueryCache,
  invalidateCachedQueries,
} from "@/lib/api/query-cache";
import { hydrateCatalogMediaEntities } from "./hydrate-catalog-media-entities";
import type { CatalogSearchExpandableShelfType } from "@musical/shared-constants";
import { invalidateAllMediaEntities } from "@/lib/media/media-entity-store";
import { notifyHomeRecommendationsStale } from "@/lib/recommendations/home-revalidation";
import type {
  CatalogArtistSongsPage,
  CatalogAlbumRelatedResponse,
  CatalogReference,
  CatalogResponse,
} from "./catalog.types";
import type { CatalogMusicVideo } from "./music-videos.api";

const STOREFRONT = process.env.NEXT_PUBLIC_STOREFRONT || "vn";
const MAX_RESOURCE_CACHE_ENTRIES = 100;
const resourceCache = createQueryCache<CatalogResponse>({
  maxEntries: MAX_RESOURCE_CACHE_ENTRIES,
});
const detailCache = createQueryCache<CatalogResponse>({
  maxEntries: MAX_RESOURCE_CACHE_ENTRIES,
});
const albumRelatedCache = createQueryCache<CatalogAlbumRelatedResponse>({
  maxEntries: MAX_RESOURCE_CACHE_ENTRIES,
});
const searchOverviewCache = createQueryCache<CatalogSearchOverviewResponse>({
  maxEntries: MAX_RESOURCE_CACHE_ENTRIES,
});
const searchPageCache = createQueryCache<CatalogSearchResultsResponse>({
  maxEntries: MAX_RESOURCE_CACHE_ENTRIES,
});

function resourceCacheKey(
  resources: Array<Pick<CatalogReference, "id" | "type">>,
) {
  return resources
    .map((resource) => `${resource.type}:${resource.id}`)
    .sort()
    .join("|");
}

export async function getCatalogResources(
  resources: Array<Pick<CatalogReference, "id" | "type">>,
  signal?: AbortSignal,
) {
  const key = resourceCacheKey(resources);
  return resourceCache.get(
    key,
    async (signal) => {
      const response = await http.post<CatalogResponse>(
        `/catalog/${STOREFRONT}/resources`,
        { resources },
        { signal },
      );
      return response.data;
    },
    { signal, transform: hydrateCatalogMediaEntities },
  );
}

function catalogDetailCacheKey(
  resourceType: CatalogDetailResourceType,
  resourceId: string,
  userId: string | null = useAuthStore.getState().user?.userId ?? null,
) {
  return resourceType === "playlists"
    ? `playlists:${userId ?? "guest"}:${resourceId}`
    : `${resourceType}:${resourceId}`;
}

export type CatalogDetailResourceType =
  | "albums"
  | "playlists"
  | "artists"
  | "release-tracks";

export function getCatalogDetailSnapshot(
  resourceType: CatalogDetailResourceType,
  resourceId: string,
  userId: string | null = useAuthStore.getState().user?.userId ?? null,
) {
  return detailCache.snapshot(
    catalogDetailCacheKey(resourceType, resourceId, userId),
  );
}

function getCatalogDetail(
  resourceType: CatalogDetailResourceType,
  resourceId: string,
  signal?: AbortSignal,
  prepare?: (
    response: CatalogResponse,
    signal: AbortSignal,
  ) => Promise<CatalogResponse>,
) {
  const request = (requestSignal: AbortSignal) =>
    http
      .get<CatalogResponse>(
        `/catalog/${STOREFRONT}/${resourceType}/${encodeURIComponent(resourceId)}`,
        { signal: requestSignal },
      )
      .then((response) =>
        prepare ? prepare(response.data, requestSignal) : response.data,
      );

  return detailCache.get(
    catalogDetailCacheKey(resourceType, resourceId),
    request,
    { signal, transform: hydrateCatalogMediaEntities },
  );
}

export function invalidateCatalogResourceCache() {
  resourceCache.clear();
  detailCache.clear();
  albumRelatedCache.clear();
  searchOverviewCache.clear();
  searchPageCache.clear();
  invalidateCachedQueries("catalog:");
  invalidateAllMediaEntities();
}

export async function getCatalogAlbum(albumId: string, signal?: AbortSignal) {
  return getCatalogDetail("albums", albumId, signal);
}

export async function getCatalogReleaseTrack(
  releaseTrackId: string,
  signal?: AbortSignal,
) {
  return getCatalogDetail("release-tracks", releaseTrackId, signal);
}

type AlbumRelatedOptions = {
  section?: string;
  cursor?: string;
  limit?: number;
  sourceSongId?: string;
};

function albumRelatedCacheKey(albumId: string, options: AlbumRelatedOptions) {
  return JSON.stringify([
    albumId,
    options.section ?? null,
    options.cursor ?? null,
    options.limit ?? null,
    options.sourceSongId ?? null,
  ]);
}

export function getCatalogAlbumRelatedSnapshot(
  albumId: string,
  options: AlbumRelatedOptions = {},
) {
  return albumRelatedCache.snapshot(albumRelatedCacheKey(albumId, options));
}

export async function getCatalogAlbumRelated(
  albumId: string,
  options: AlbumRelatedOptions = {},
  signal?: AbortSignal,
) {
  return albumRelatedCache.get(
    albumRelatedCacheKey(albumId, options),
    async (requestSignal) => {
      const response = await http.get<CatalogAlbumRelatedResponse>(
        `/catalog/${STOREFRONT}/albums/${encodeURIComponent(albumId)}/related`,
        { params: options, signal: requestSignal },
      );
      return response.data;
    },
    {
      signal,
      transform: (response) => {
        hydrateCatalogMediaEntities(response.moreBy);
        hydrateCatalogMediaEntities(response.featuredOn);
        hydrateCatalogMediaEntities(response.youMightAlsoLike);
        return response;
      },
    },
  );
}

export async function getCatalogPlaylist(
  playlistId: string,
  signal?: AbortSignal,
) {
  return getCatalogDetail(
    "playlists",
    playlistId,
    signal,
    (catalog, requestSignal) =>
      personalizeCatalogPlaylist(catalog, playlistId, requestSignal),
  );
}

async function personalizeCatalogPlaylist(
  catalog: CatalogResponse,
  playlistId: string,
  signal: AbortSignal,
) {
  const root = catalog.data.find((resource) => resource.type === "playlists");
  const playlist = root ? catalog.resources.playlists[root.id] : undefined;
  if (!root || playlist?.attributes.playlistType !== "system-personalized") {
    return catalog;
  }

  // Personalized playlists keep global URLs; this endpoint supplies the
  // current listener's recommendation order.
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
    .map((id) => ({
      id,
      type: "songs",
      href: `/catalog/${STOREFRONT}/songs/${id}`,
    }));
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
    ? response.data.trackIds.filter(
        (id): id is string => typeof id === "string",
      )
    : [];
}

export function getCatalogResourcesSnapshot(
  resources: Array<Pick<CatalogReference, "id" | "type">>,
) {
  return resourceCache.snapshot(resourceCacheKey(resources));
}

export type CatalogSearchSuggestionsResponse = CatalogResponse & {
  hints: string[];
};

export type CatalogSearchResultsResponse = CatalogResponse & {
  hasMore: boolean;
};

export type CatalogSearchShelfType = CatalogSearchExpandableShelfType;

export type CatalogSearchOverviewResponse = {
  resources: CatalogResponse["resources"];
  topResults: {
    data: CatalogResponse["data"];
    hasMore: boolean;
  };
  shelves: {
    data: CatalogResponse["data"];
    musicVideos: CatalogMusicVideo[];
    shelfHasMore: Partial<Record<CatalogSearchShelfType, boolean>>;
  };
};

function hydrateCatalogSearchOverview(response: CatalogSearchOverviewResponse) {
  hydrateCatalogMediaEntities({
    data: response.topResults.data,
    resources: response.resources,
  });
  return response;
}

export async function searchCatalogSuggestions(
  query: string,
  signal?: AbortSignal,
): Promise<CatalogSearchSuggestionsResponse> {
  const response = await http.get<CatalogSearchSuggestionsResponse>(
    `/catalog/${STOREFRONT}/search/suggestions`,
    { params: { q: query }, signal },
  );
  return hydrateCatalogMediaEntities(response.data);
}

type SearchPageOptions = {
  source: "results" | "shelf";
  shelfType?: CatalogSearchShelfType;
  limit?: number;
  offset?: number;
};

function searchCacheKey(
  query: string,
  options: readonly unknown[],
  userId: string | null = useAuthStore.getState().user?.userId ?? null,
) {
  return JSON.stringify([
    userId,
    normalizeCatalogSearchQuery(query),
    ...options,
  ]);
}

function searchPageCacheKey(
  query: string,
  options: SearchPageOptions,
  userId?: string | null,
) {
  return searchCacheKey(
    query,
    [
      options.source,
      options.shelfType ?? null,
      options.limit ?? null,
      options.offset ?? 0,
    ],
    userId,
  );
}

export function getCatalogSearchPageSnapshot(
  query: string,
  options: SearchPageOptions,
  userId?: string | null,
) {
  return searchPageCache.snapshot(searchPageCacheKey(query, options, userId));
}

export function getCatalogSearchOverviewSnapshot(
  query: string,
  options: { topLimit?: number; shelfLimit?: number },
  userId?: string | null,
) {
  return searchOverviewCache.snapshot(
    searchCacheKey(
      query,
      [options.topLimit ?? null, options.shelfLimit ?? null],
      userId,
    ),
  );
}

export async function searchCatalogResults(
  query: string,
  options: { limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<CatalogSearchResultsResponse> {
  return searchPageCache.get(
    searchPageCacheKey(query, { ...options, source: "results" }),
    async (requestSignal) => {
      const response = await http.get<CatalogSearchResultsResponse>(
        `/catalog/${STOREFRONT}/search/results`,
        { params: { q: query, ...options }, signal: requestSignal },
      );
      return response.data;
    },
    { signal, transform: hydrateCatalogMediaEntities },
  );
}

export async function searchCatalogOverview(
  query: string,
  options: { topLimit?: number; shelfLimit?: number } = {},
  signal?: AbortSignal,
): Promise<CatalogSearchOverviewResponse> {
  return searchOverviewCache.get(
    searchCacheKey(query, [
      options.topLimit ?? null,
      options.shelfLimit ?? null,
    ]),
    async (requestSignal) => {
      const response = await http.get<CatalogSearchOverviewResponse>(
        `/catalog/${STOREFRONT}/search/overview`,
        { params: { q: query, ...options }, signal: requestSignal },
      );
      return response.data;
    },
    { signal, transform: hydrateCatalogSearchOverview },
  );
}

export async function searchCatalogShelf(
  query: string,
  type: CatalogSearchShelfType,
  options: { limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<CatalogSearchResultsResponse> {
  return searchPageCache.get(
    searchPageCacheKey(query, { ...options, source: "shelf", shelfType: type }),
    async (requestSignal) => {
      const response = await http.get<CatalogSearchResultsResponse>(
        `/catalog/${STOREFRONT}/search/shelf`,
        { params: { q: query, type, ...options }, signal: requestSignal },
      );
      return response.data;
    },
    { signal, transform: hydrateCatalogMediaEntities },
  );
}

export async function recordCatalogSearchClick(
  resourceType: string,
  resourceId: string,
) {
  const response = await http.post<{ success: boolean }>(
    `/catalog/${STOREFRONT}/search/click`,
    {
      resourceType,
      resourceId,
    },
  );
  if (!response.data.success) {
    throw new Error("SEARCH_CLICK_NOT_RECORDED");
  }
  notifyHomeRecommendationsStale();
}

export type CatalogRecentSearchesResponse = CatalogResponse & {
  musicVideos?: CatalogMusicVideo[];
};

export async function getCatalogRecentSearches(signal?: AbortSignal) {
  const response = await http.get<CatalogRecentSearchesResponse>(
    `/catalog/${STOREFRONT}/search/recent`,
    { signal },
  );
  return hydrateCatalogMediaEntities(response.data);
}

export async function clearCatalogRecentSearches() {
  await http.delete(`/catalog/${STOREFRONT}/search/recent`);
}

export async function getCatalogArtist(artistId: string, signal?: AbortSignal) {
  return getCatalogDetail("artists", artistId, signal);
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

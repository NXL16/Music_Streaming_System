import { http } from "@/lib/api/http";
import {
  removeRecentlyPlayedPlaylistSnapshot,
  restoreRecentlyPlayedPlaylistSnapshot,
} from "@/lib/recommendations/recently-played-snapshot";
import { scheduleRealtimeExpiry } from "@/lib/notifications/realtime-expiry";
import type { CatalogArtwork } from "@/lib/catalog/catalog.types";
import {
  getCatalogMusicVideo,
  getCatalogSongMusicVideos,
} from "@/lib/catalog/music-videos.api";
import type { TrackSource } from "@/lib/songs/track-sources";
import {
  removeFavoriteSongsFromStore,
  restoreFavoriteSongsToStore,
  useFavoriteStore,
} from "@/lib/favorites/use-favorite-store";
import { notifyFavoriteChanged } from "@/lib/favorites/favorite-events";
import { notifyAlbumFavoriteChanged } from "@/lib/favorites/album-favorite-events";
import { notifyPlaylistFavoriteChanged } from "@/lib/favorites/playlist-favorite-events";
import { usePlaylistFavoriteStore } from "@/lib/favorites/use-playlist-favorite-store";

export type LibraryResourceType =
  | "songs"
  | "albums"
  | "playlists"
  | "music-videos";

export type LibraryResourceInput = {
  resourceType: LibraryResourceType;
  resourceId: string;
  title?: string;
  subtitle?: string;
  artworkUrl?: string;
  sourceAlbumId?: string;
  sourceOrigin?: "catalog" | "favorite" | "user-playlist";
  songIds?: string[];
  trackSources?: TrackSource[];
};

export type LibraryResource = LibraryResourceInput & {
  isPinned: boolean;
  pinnedAt: number;
};

export type OptimisticLibraryAddition = Array<
  Pick<LibraryResource, "resourceType" | "resourceId">
>;

/** Enriched Library projection used by card and sidebar surfaces. */
export type LibraryMediaCardResource = {
  resourceType: "albums" | "playlists";
  resourceId: string;
  title: string;
  subtitle: string;
  artworkUrl: string;
  catalogUrl: string;
  contentRating: string;
  artists: Array<{ id: string; name: string; url: string }>;
  artwork?: CatalogArtwork;
  songIds?: string[];
  createdAt?: string;
};

export type LibraryResourcesChange = Pick<
  LibraryResource,
  "resourceType" | "resourceId"
> & {
  operation?:
    | "add"
    | "remove"
    | "pending-remove"
    | "restore"
    | "pin"
    | "unpin"
    | "update"
    | "sync";
  sourceOrigin?: LibraryResourceInput["sourceOrigin"];
  sourceId?: string;
  expiresAt?: number;
  songIds?: string[];
  musicVideoIds?: string[];
};

let cachedResources: LibraryResource[] | null = null;
let cachedAt = 0;
let loadingResources: Promise<LibraryResource[]> | null = null;
let cachedMediaCards: LibraryMediaCardResource[] | null = null;
let mediaCardsCachedAt = 0;
let loadingMediaCards: Promise<LibraryMediaCardResource[]> | null = null;
let mediaCardsVersion = 0;
let libraryResourcesVersion = 0;
let libraryResourcesRevision = 0;
const mutationLocks = new Map<string, Promise<unknown>>();
// A Favourite can create an Album and many Song memberships in one server
// transaction. Keep its optimistic rows until a Library response explicitly
// contains them; an older in-flight GET must never make the header flip back
// from the checkmark to “Add”.
const pendingOptimisticLibraryAdditions = new Map<string, LibraryResource>();
const pendingLibraryRemovals = new Map<string, { undo: () => void }>();
// The server intentionally waits for the Undo window before deleting. This
// registry is the single source of truth for the optimistic interval, so a
// refetch from any Library surface cannot resurrect a pending item.
const pendingLibraryRemovalKeys = new Set<string>();
const pendingCascadeSongIdsByParent = new Map<string, string[]>();
const pendingCascadeSongRefCounts = new Map<string, number>();
const pendingCascadeMusicVideoIdsByParent = new Map<string, string[]>();
const pendingCascadeMusicVideoRefCounts = new Map<string, number>();
const remotePendingRemovalExpiries = new Map<string, () => void>();
const LIBRARY_RESOURCES_CHANGED_EVENT = "library:resources-changed";
const LIBRARY_CACHE_TTL_MS = 120_000;
const LIBRARY_SYNC_CHANNEL = "library-resources";
export const LIBRARY_REMOVAL_UNDO_DURATION_MS = 5_000;
const librarySyncChannel =
  typeof window !== "undefined" && "BroadcastChannel" in window
    ? new BroadcastChannel(LIBRARY_SYNC_CHANNEL)
    : null;

function notifyLibraryResourcesChanged(change?: LibraryResourcesChange) {
  mediaCardsVersion += 1;
  libraryResourcesVersion += 1;
  cachedMediaCards = null;
  mediaCardsCachedAt = 0;
  loadingMediaCards = null;
  libraryResourcesRevision += 1;
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<LibraryResourcesChange | undefined>(
        LIBRARY_RESOURCES_CHANGED_EVENT,
        { detail: change },
      ),
    );
  }
}

export function getLibraryResourcesRevision() {
  return libraryResourcesRevision;
}

/**
 * Synchronous snapshot for UI that already subscribes to the Library revision.
 * Mutations update this cache before emitting that revision, so consumers see
 * optimistic add/remove state without waiting for an HTTP round trip.
 */
export function getLibraryResourcesSnapshot() {
  return cachedResources;
}

export function subscribeLibraryResourcesRevision(listener: () => void) {
  return subscribeLibraryResourcesChanged(listener);
}

function broadcastLibraryResourcesChanged(change: LibraryResourcesChange) {
  librarySyncChannel?.postMessage(change);
}

if (librarySyncChannel) {
  librarySyncChannel.onmessage = (
    event: MessageEvent<LibraryResourcesChange>,
  ) => {
    const change = event.data;
    if (!change) return;
    const key = resourceKey(change.resourceType, change.resourceId);
    if (change?.operation === "pending-remove") {
      pendingLibraryRemovalKeys.add(key);
      setPendingCascadeSongs(key, change.songIds);
      setPendingCascadeMusicVideos(key, change.musicVideoIds);
      scheduleRemotePendingRemovalExpiry(key, change);
    } else if (
      change?.operation === "restore" ||
      change?.operation === "remove"
    ) {
      clearRemotePendingRemovalExpiry(key);
      pendingLibraryRemovalKeys.delete(key);
      clearPendingCascadeSongs(key);
      clearPendingCascadeMusicVideos(key);
    }
    cachedResources = null;
    cachedAt = 0;
    loadingResources = null;
    notifyLibraryResourcesChanged(change);
  };
}

function setPendingCascadeSongs(parentKey: string, songIds?: string[]) {
  clearPendingCascadeSongs(parentKey);
  const ids = uniqueSongIds(songIds);
  if (!ids.length) return;

  pendingCascadeSongIdsByParent.set(parentKey, ids);
  ids.forEach((songId) => {
    const songKey = resourceKey("songs", songId);
    const count = pendingCascadeSongRefCounts.get(songKey) ?? 0;
    pendingCascadeSongRefCounts.set(songKey, count + 1);
    pendingLibraryRemovalKeys.add(songKey);
  });
}

function clearPendingCascadeSongs(parentKey: string) {
  const songIds = pendingCascadeSongIdsByParent.get(parentKey) ?? [];
  pendingCascadeSongIdsByParent.delete(parentKey);
  songIds.forEach((songId) => {
    const songKey = resourceKey("songs", songId);
    const nextCount = (pendingCascadeSongRefCounts.get(songKey) ?? 1) - 1;
    if (nextCount > 0) {
      pendingCascadeSongRefCounts.set(songKey, nextCount);
      return;
    }
    pendingCascadeSongRefCounts.delete(songKey);
    pendingLibraryRemovalKeys.delete(songKey);
  });
}

function setPendingCascadeMusicVideos(parentKey: string, videoIds?: string[]) {
  clearPendingCascadeMusicVideos(parentKey);
  const ids = uniqueResourceIds(videoIds);
  if (!ids.length) return;

  pendingCascadeMusicVideoIdsByParent.set(parentKey, ids);
  ids.forEach((videoId) => {
    const videoKey = resourceKey("music-videos", videoId);
    const count = pendingCascadeMusicVideoRefCounts.get(videoKey) ?? 0;
    pendingCascadeMusicVideoRefCounts.set(videoKey, count + 1);
    pendingLibraryRemovalKeys.add(videoKey);
  });
}

function clearPendingCascadeMusicVideos(parentKey: string) {
  const videoIds = pendingCascadeMusicVideoIdsByParent.get(parentKey) ?? [];
  pendingCascadeMusicVideoIdsByParent.delete(parentKey);
  videoIds.forEach((videoId) => {
    const videoKey = resourceKey("music-videos", videoId);
    const nextCount =
      (pendingCascadeMusicVideoRefCounts.get(videoKey) ?? 1) - 1;
    if (nextCount > 0) {
      pendingCascadeMusicVideoRefCounts.set(videoKey, nextCount);
      return;
    }
    pendingCascadeMusicVideoRefCounts.delete(videoKey);
    pendingLibraryRemovalKeys.delete(videoKey);
  });
}

function clearRemotePendingRemovalExpiry(key: string) {
  remotePendingRemovalExpiries.get(key)?.();
  remotePendingRemovalExpiries.delete(key);
}

function scheduleRemotePendingRemovalExpiry(
  key: string,
  change: LibraryResourcesChange,
) {
  clearRemotePendingRemovalExpiry(key);
  if (!change.expiresAt || change.expiresAt <= Date.now()) {
    pendingLibraryRemovalKeys.delete(key);
    return;
  }

  const cancel = scheduleRealtimeExpiry(change.expiresAt, () => {
    remotePendingRemovalExpiries.delete(key);
    pendingLibraryRemovalKeys.delete(key);
    clearPendingCascadeSongs(key);
    clearPendingCascadeMusicVideos(key);
    cachedResources = null;
    cachedAt = 0;
    loadingResources = null;
    // The source tab may have closed before committing or restoring. Refetch
    // the server state once the shared Undo window ends.
    void getLibraryResources()
      .catch(() => undefined)
      .finally(() => {
        notifyLibraryResourcesChanged({
          resourceType: change.resourceType,
          resourceId: change.resourceId,
          operation: "sync",
        });
      });
  });
  remotePendingRemovalExpiries.set(key, cancel);
}

function resourceKey(resourceType: LibraryResourceType, resourceId: string) {
  return `${resourceType}:${resourceId}`;
}

function uniqueSongIds(songIds?: string[]) {
  return [...new Set(songIds?.filter(Boolean) ?? [])];
}

function uniqueResourceIds(resourceIds?: string[]) {
  return [...new Set(resourceIds?.filter(Boolean) ?? [])];
}

/** Returns the song memberships that actually belong to a saved album. */
async function resolvePendingCascadeSongIds(input: LibraryResourceInput) {
  if (input.resourceType === "albums") {
    // A track save creates the album parent but only the chosen track rows.
    // Cascade exactly those persisted rows, never every catalog track.
    const resources = await getLibraryResources();
    return resources
      .filter(
        (resource) =>
          resource.resourceType === "songs" &&
          resource.sourceAlbumId === input.resourceId,
      )
      .map((resource) => resource.resourceId);
  }
  return [];
}

export function isLibraryResourcePendingRemoval(
  resourceType: LibraryResourceType,
  resourceId: string,
) {
  return pendingLibraryRemovalKeys.has(resourceKey(resourceType, resourceId));
}

/**
 * Restores an item whose Library deletion is still inside the Undo window.
 * Keeping this at the cache/API boundary means every Add entry point behaves
 * consistently, rather than each button having to know about pending toasts.
 */
function cancelPendingLibraryResourceRemoval(
  resourceType: LibraryResourceType,
  resourceId: string,
) {
  const pendingRemoval = pendingLibraryRemovals.get(
    resourceKey(resourceType, resourceId),
  );
  if (!pendingRemoval) return false;

  pendingRemoval.undo();
  return true;
}

function withResourceMutation<T>(
  resourceType: LibraryResourceType,
  resourceId: string,
  mutation: () => Promise<T>,
) {
  const key = resourceKey(resourceType, resourceId);
  const previous = mutationLocks.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(mutation);
  mutationLocks.set(key, current);

  return current.finally(() => {
    if (mutationLocks.get(key) === current) mutationLocks.delete(key);
  });
}

export function subscribeLibraryResourcesChanged(
  listener: (change?: LibraryResourcesChange) => void,
) {
  const handleChange = (event: Event) => {
    listener((event as CustomEvent<LibraryResourcesChange | undefined>).detail);
  };
  window.addEventListener(LIBRARY_RESOURCES_CHANGED_EVENT, handleChange);
  return () =>
    window.removeEventListener(LIBRARY_RESOURCES_CHANGED_EVENT, handleChange);
}

export function clearLibraryResourcesCache() {
  cachedResources = null;
  cachedAt = 0;
  loadingResources = null;
  cachedMediaCards = null;
  mediaCardsCachedAt = 0;
  loadingMediaCards = null;
  pendingLibraryRemovalKeys.clear();
  pendingOptimisticLibraryAdditions.clear();
  pendingCascadeSongIdsByParent.clear();
  pendingCascadeSongRefCounts.clear();
  remotePendingRemovalExpiries.forEach((cancel) => cancel());
  remotePendingRemovalExpiries.clear();
  notifyLibraryResourcesChanged();
}

/**
 * Use after a server-side flow has already changed library membership.
 * It invalidates local state and lets every library consumer refetch without
 * issuing the same mutation a second time.
 */
export function refreshLibraryResources(change: LibraryResourcesChange) {
  cachedResources = null;
  cachedAt = 0;
  loadingResources = null;
  cachedMediaCards = null;
  mediaCardsCachedAt = 0;
  loadingMediaCards = null;
  notifyLibraryResourcesChanged(change);
  broadcastLibraryResourcesChanged(change);
}

/**
 * Applies a server-backed Library addition locally before the request returns.
 * This is used by actions such as Favourite, whose API also persists Library
 * membership, so Detail controls, cards and an open context menu share the
 * same immediate state instead of waiting for a refetch.
 */
export function optimisticallyAddLibraryResource(
  input: LibraryResourceInput,
): OptimisticLibraryAddition {
  // Favourite also restores Library membership on the server. If the user
  // favourites during the Undo window, cancel the deferred removal first so
  // its timer cannot later delete the newly restored resource.
  cancelPendingLibraryResourceRemoval(input.resourceType, input.resourceId);

  const added: OptimisticLibraryAddition = [];
  const currentResources = [...(cachedResources ?? [])];
  const existingKeys = new Set(
    currentResources.map((resource) =>
      resourceKey(resource.resourceType, resource.resourceId),
    ),
  );
  const add = (resource: LibraryResource) => {
    const key = resourceKey(resource.resourceType, resource.resourceId);
    if (existingKeys.has(key)) return;
    existingKeys.add(key);
    currentResources.push(resource);
    pendingOptimisticLibraryAdditions.set(key, resource);
    added.push({
      resourceType: resource.resourceType,
      resourceId: resource.resourceId,
    });
  };

  add({ ...input, isPinned: false, pinnedAt: 0 });

  // A catalogue-album Favourite persists every child Song as part of the
  // same server transaction. Mirror those exact child memberships now so the
  // menu and Album Detail apply the same complete-album rule immediately.
  if (input.resourceType === "albums") {
    for (const songId of uniqueSongIds(input.songIds)) {
      add({
        resourceType: "songs",
        resourceId: songId,
        sourceAlbumId: input.resourceId,
        isPinned: false,
        pinnedAt: 0,
      });
    }
  }

  if (added.length) {
    cachedResources = currentResources;
  }
  cachedAt = 0;
  const change: LibraryResourcesChange = {
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    operation: "add",
  };
  notifyLibraryResourcesChanged(change);
  broadcastLibraryResourcesChanged(change);
  return added;
}

/** Revalidates without discarding the optimistic snapshot currently on screen. */
export function revalidateLibraryResources(change: LibraryResourcesChange) {
  cachedAt = 0;
  loadingResources = null;
  cachedMediaCards = null;
  mediaCardsCachedAt = 0;
  loadingMediaCards = null;
  notifyLibraryResourcesChanged(change);
  broadcastLibraryResourcesChanged(change);
}

/** Restores the cache when an optimistic server-backed addition fails. */
export function rollbackOptimisticLibraryAddition(
  added: OptimisticLibraryAddition,
) {
  if (!added.length) return;
  const addedKeys = new Set(
    added.map((resource) =>
      resourceKey(resource.resourceType, resource.resourceId),
    ),
  );
  addedKeys.forEach((key) => pendingOptimisticLibraryAdditions.delete(key));
  cachedResources =
    cachedResources?.filter(
      (resource) =>
        !addedKeys.has(resourceKey(resource.resourceType, resource.resourceId)),
    ) ?? null;
  const change: LibraryResourcesChange = {
    resourceType: added[0].resourceType,
    resourceId: added[0].resourceId,
    operation: "sync",
  };
  notifyLibraryResourcesChanged(change);
  broadcastLibraryResourcesChanged(change);
}

export async function getLibraryResources() {
  if (cachedResources && Date.now() - cachedAt < LIBRARY_CACHE_TTL_MS) {
    return cachedResources;
  }
  if (loadingResources) return loadingResources;

  const requestVersion = libraryResourcesVersion;
  loadingResources = http
    .get<{ resources: LibraryResource[] }>("/songs/library/resources")
    .then(({ data }) => {
      const resources = data.resources.filter(
        (resource) =>
          !isLibraryResourcePendingRemoval(
            resource.resourceType,
            resource.resourceId,
          ),
      );

      const serverKeys = new Set(
        resources.map((resource) =>
          resourceKey(resource.resourceType, resource.resourceId),
        ),
      );
      for (const [key, optimisticResource] of pendingOptimisticLibraryAdditions) {
        if (serverKeys.has(key)) {
          pendingOptimisticLibraryAdditions.delete(key);
        } else {
          resources.push(optimisticResource);
        }
      }

      // A Library mutation may have completed while this request was in
      // flight. Keep the optimistic cache in that case: the API intentionally
      // retains a deleted item during its Undo window, so this stale response
      // must never resurrect it in any subscribed surface.
      if (requestVersion !== libraryResourcesVersion) {
        return cachedResources ?? resources;
      }

      cachedResources = resources;
      cachedAt = Date.now();
      return resources;
    })
    .finally(() => {
      loadingResources = null;
    });

  return loadingResources;
}

/**
 * Returns the enriched card projection through the same cache invalidation
 * boundary as Library membership. This prevents each surface from refetching
 * `/songs/library/media-cards` independently after the same mutation.
 */
export async function getLibraryMediaCards() {
  if (
    cachedMediaCards &&
    Date.now() - mediaCardsCachedAt < LIBRARY_CACHE_TTL_MS
  ) {
    return cachedMediaCards;
  }
  if (loadingMediaCards) return loadingMediaCards;

  const requestVersion = mediaCardsVersion;
  loadingMediaCards = http
    .get<{ resources?: LibraryMediaCardResource[] }>(
      "/songs/library/media-cards",
    )
    .then(({ data }) => {
      const resources = (data.resources ?? []).filter(
        (resource) =>
          !isLibraryResourcePendingRemoval(
            resource.resourceType,
            resource.resourceId,
          ),
      );
      if (requestVersion === mediaCardsVersion) {
        cachedMediaCards = resources;
        mediaCardsCachedAt = Date.now();
      }
      return resources;
    })
    .finally(() => {
      if (requestVersion === mediaCardsVersion) loadingMediaCards = null;
    });

  return loadingMediaCards;
}

export function isLibraryResource(
  resourceType: LibraryResourceType,
  resourceId: string,
) {
  return Boolean(
    cachedResources?.some(
      (resource) =>
        resource.resourceType === resourceType &&
        resource.resourceId === resourceId,
    ),
  );
}

/**
 * An album is fully saved only when every track from this exact release has a
 * matching Library Song membership. Its parent Album row alone is not enough.
 */
export function isLibraryAlbumComplete(albumId: string, songIds?: string[]) {
  const requiredSongIds = uniqueSongIds(songIds);
  if (!requiredSongIds.length) return isLibraryResource("albums", albumId);

  const savedSongIds = new Set(
    cachedResources
      ?.filter(
        (resource) =>
          resource.resourceType === "songs" &&
          resource.sourceAlbumId === albumId,
      )
      .map((resource) => resource.resourceId) ?? [],
  );
  return requiredSongIds.every((songId) => savedSongIds.has(songId));
}

export function isLibraryResourcePinned(
  resourceType: LibraryResourceType,
  resourceId: string,
) {
  return Boolean(
    cachedResources?.find(
      (resource) =>
        resource.resourceType === resourceType &&
        resource.resourceId === resourceId,
    )?.isPinned,
  );
}

export function hasLibraryResourceMembership(input: {
  resourceType: LibraryResourceType;
  resourceId: string;
  songIds?: string[];
  isLibraryAlbumView?: boolean;
}) {
  if (input.resourceType !== "albums") {
    return isLibraryResource(input.resourceType, input.resourceId);
  }
  if (input.isLibraryAlbumView) {
    return isLibraryResource("albums", input.resourceId);
  }

  // A public Album is only “in Library” after every release track is saved.
  // Never treat its parent row as proof when a lightweight card/menu has not
  // supplied the canonical tracklist; doing so disagrees with Album Detail.
  const songIds = uniqueSongIds(input.songIds);
  if (!songIds.length) return false;
  return isLibraryAlbumComplete(input.resourceId, songIds);
}

async function addLibraryResourceInternal(
  input: LibraryResourceInput,
  sourceId?: string,
) {
  if (
    cancelPendingLibraryResourceRemoval(input.resourceType, input.resourceId)
  ) {
    return;
  }

  await http.post("/songs/library/resources", input);

  const savedSongAlbumId =
    input.resourceType === "songs" ? input.sourceAlbumId : undefined;
  const albumCreatesSongMemberships =
    input.resourceType === "albums" && input.sourceOrigin === "catalog";
  if (savedSongAlbumId || albumCreatesSongMemberships) {
    // A saved track creates its parent Album; saving a catalog Album creates
    // every child Song. Always refetch this server-derived membership set so
    // Detail controls and every Context Menu read the exact same state.
    cachedResources = null;
    cachedAt = 0;
    loadingResources = null;
    cachedMediaCards = null;
    await getLibraryResources();

    const mutationWasPersisted = savedSongAlbumId
      ? isLibraryResource("songs", input.resourceId)
      : isLibraryAlbumComplete(input.resourceId, input.songIds);
    if (!mutationWasPersisted) {
      // Never leave the UI in a false "saved" state when a collection
      // cascade was only partially persisted by a failed server request.
      throw new Error("LIBRARY_MEMBERSHIP_VERIFICATION_FAILED");
    }
  }

  if (!cachedResources) await getLibraryResources();

  if (cachedResources) {
    const existingIndex = cachedResources.findIndex(
      (resource) =>
        resource.resourceType === input.resourceType &&
        resource.resourceId === input.resourceId,
    );
    if (existingIndex === -1) {
      cachedResources = [
        ...cachedResources,
        {
          ...input,
          isPinned: false,
          pinnedAt: 0,
        },
      ];
    }
  }

  const change = {
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    sourceId,
    operation: "add" as const,
  };
  notifyLibraryResourcesChanged(change);
  broadcastLibraryResourcesChanged(change);

  if (savedSongAlbumId) {
    const parentChange: LibraryResourcesChange = {
      resourceType: "albums",
      resourceId: savedSongAlbumId,
      sourceId,
      operation: "add",
    };
    notifyLibraryResourcesChanged(parentChange);
    broadcastLibraryResourcesChanged(parentChange);
  }

  if (albumCreatesSongMemberships) {
    const cascadeChange: LibraryResourcesChange = {
      resourceType: "songs",
      resourceId: "",
      operation: "sync",
      sourceId,
    };
    notifyLibraryResourcesChanged(cascadeChange);
    broadcastLibraryResourcesChanged(cascadeChange);
  }
}

export function addLibraryResource(
  input: LibraryResourceInput,
  sourceId?: string,
) {
  return withResourceMutation(input.resourceType, input.resourceId, () =>
    addLibraryResourceInternal(input, sourceId),
  );
}

async function pinLibraryResourceInternal(
  resourceType: LibraryResourceType,
  resourceId: string,
) {
  await http.post(`/songs/library/resources/${resourceType}/${resourceId}/pin`);

  if (cachedResources) {
    const pinnedAt = Date.now();
    cachedResources = cachedResources.map((resource) =>
      resource.resourceType === resourceType &&
      resource.resourceId === resourceId
        ? { ...resource, isPinned: true, pinnedAt }
        : resource,
    );
  }

  const change = { resourceType, resourceId, operation: "pin" as const };
  notifyLibraryResourcesChanged(change);
  broadcastLibraryResourcesChanged(change);
}

async function unpinLibraryResourceInternal(
  resourceType: LibraryResourceType,
  resourceId: string,
) {
  await http.delete(
    `/songs/library/resources/${resourceType}/${resourceId}/pin`,
  );

  if (cachedResources) {
    cachedResources = cachedResources.map((resource) =>
      resource.resourceType === resourceType &&
      resource.resourceId === resourceId
        ? { ...resource, isPinned: false, pinnedAt: 0 }
        : resource,
    );
  }

  const change = { resourceType, resourceId, operation: "unpin" as const };
  notifyLibraryResourcesChanged(change);
  broadcastLibraryResourcesChanged(change);
}

export async function toggleLibraryResourcePin(
  resourceType: LibraryResourceType,
  resourceId: string,
): Promise<boolean> {
  return withResourceMutation(resourceType, resourceId, async () => {
    const resources = await getLibraryResources();
    const resource = resources.find(
      (item) =>
        item.resourceType === resourceType && item.resourceId === resourceId,
    );

    if (!resource) throw new Error("LIBRARY_RESOURCE_NOT_FOUND");

    if (resource.isPinned) {
      await unpinLibraryResourceInternal(resourceType, resourceId);
      return false;
    }

    await pinLibraryResourceInternal(resourceType, resourceId);
    return true;
  });
}

async function removeLibraryResourceInternal(
  resourceType: LibraryResourceType,
  resourceId: string,
  sourceId?: string,
  cascade?: Pick<
    LibraryResourceInput,
    "sourceAlbumId" | "sourceOrigin" | "songIds"
  >,
) {
  const { data } = await http.delete<{
    deletedUserPlaylist?: boolean;
    favoriteRemoved?: boolean;
    removedFavoriteSongIds?: string[];
    removedEmptyAlbumId?: string;
    removedEmptyAlbumFavorite?: boolean;
  }>(`/songs/library/resources/${resourceType}/${resourceId}`, {
    data: cascade,
  });

  // Only deleting an owned playlist destroys its listening context. Removing a
  // public playlist from Library must leave Recently Played untouched.
  if (data.deletedUserPlaylist) {
    removeRecentlyPlayedPlaylistSnapshot(resourceId);
  }

  if (data.favoriteRemoved) {
    if (resourceType === "albums") {
      notifyAlbumFavoriteChanged(resourceId, false);
    }
    if (resourceType === "playlists") {
      notifyPlaylistFavoriteChanged(resourceId, false);
    }
  }

  if (data.removedFavoriteSongIds?.length) {
    removeFavoriteSongsFromStore(data.removedFavoriteSongIds);
    for (const songId of data.removedFavoriteSongIds) {
      notifyFavoriteChanged(songId, false);
    }
  }

  if (data.removedEmptyAlbumId) {
    cachedResources =
      cachedResources?.filter(
        (resource) =>
          resource.resourceType !== "albums" ||
          resource.resourceId !== data.removedEmptyAlbumId,
      ) ?? null;
    const parentChange: LibraryResourcesChange = {
      resourceType: "albums",
      resourceId: data.removedEmptyAlbumId,
      sourceId,
      operation: "remove",
    };
    notifyLibraryResourcesChanged(parentChange);
    broadcastLibraryResourcesChanged(parentChange);
    if (data.removedEmptyAlbumFavorite) {
      notifyAlbumFavoriteChanged(data.removedEmptyAlbumId, false);
    }
  }

  if (cachedResources) {
    cachedResources = cachedResources.filter(
      (resource) =>
        resource.resourceType !== resourceType ||
        resource.resourceId !== resourceId,
    );
  }

  const change = {
    resourceType,
    resourceId,
    sourceId,
    sourceOrigin: cascade?.sourceOrigin,
    operation: "remove" as const,
  };
  notifyLibraryResourcesChanged(change);
  broadcastLibraryResourcesChanged(change);
}

function removeLibraryResource(
  resourceType: LibraryResourceType,
  resourceId: string,
  sourceId?: string,
  cascade?: Pick<
    LibraryResourceInput,
    "sourceAlbumId" | "sourceOrigin" | "songIds"
  >,
) {
  return withResourceMutation(resourceType, resourceId, () =>
    removeLibraryResourceInternal(resourceType, resourceId, sourceId, cascade),
  );
}

export async function beginLibraryResourceRemoval(
  input: LibraryResourceInput,
  sourceId?: string,
  expiresAt = Date.now() + LIBRARY_REMOVAL_UNDO_DURATION_MS,
) {
  if (input.resourceType === "music-videos") {
    const video = await getCatalogMusicVideo(input.resourceId);
    return beginLibraryResourceRemoval(
      {
        ...input,
        resourceType: "songs",
        resourceId: video.songId,
      },
      sourceId,
      expiresAt,
    );
  }

  const pendingKey = resourceKey(input.resourceType, input.resourceId);
  // A second delete of the same item should start from a clean, saved state.
  pendingLibraryRemovals.get(pendingKey)?.undo();

  const [resources, pendingSongIds, linkedMusicVideoIds] = await Promise.all([
    getLibraryResources(),
    resolvePendingCascadeSongIds(input),
    input.resourceType === "songs"
      ? getCatalogSongMusicVideos(input.resourceId)
          .then((videos) => videos.map((video) => video.id))
          .catch(() => [])
      : Promise.resolve([]),
  ]);
  const cascadedSongIds =
    input.resourceType === "albums"
      ? new Set(pendingSongIds)
      : new Set<string>();
  const removedSongIds =
    input.resourceType === "albums" ? [...cascadedSongIds] : [input.resourceId];
  const sourceAlbumId =
    input.resourceType === "songs"
      ? resources.find(
          (resource) =>
            resource.resourceType === "songs" &&
            resource.resourceId === input.resourceId,
        )?.sourceAlbumId
      : undefined;
  const removedEmptyAlbumId =
    sourceAlbumId &&
    resources.filter(
      (resource) =>
        resource.resourceType === "songs" &&
        resource.sourceAlbumId === sourceAlbumId,
    ).length === 1
      ? sourceAlbumId
      : undefined;
  const cascadeAlbumId =
    input.resourceType === "albums" ? input.resourceId : removedEmptyAlbumId;
  const cascadedMusicVideoIds = new Set(
    [
      ...linkedMusicVideoIds,
      ...(cascadeAlbumId
        ? resources
            .filter(
              (resource) =>
                resource.resourceType === "music-videos" &&
                resource.sourceAlbumId === cascadeAlbumId,
            )
            .map((resource) => resource.resourceId)
        : []),
    ],
  );
  const favoriteAlbumId =
    input.resourceType === "albums" ? input.resourceId : removedEmptyAlbumId;
  const [wasAlbumFavorite] = await Promise.all([
    favoriteAlbumId
      ? http
          .get<{ isFavorite: boolean }>(
            `/songs/albums/${encodeURIComponent(favoriteAlbumId)}/favorite`,
          )
          .then(({ data }) => data.isFavorite)
          .catch(() => false)
      : Promise.resolve(false),
    useFavoriteStore.getState().hydrate(),
    usePlaylistFavoriteStore.getState().hydrate(),
  ]);
  const wasPlaylistFavorite =
    input.resourceType === "playlists" &&
    usePlaylistFavoriteStore.getState().playlistIds.has(input.resourceId);
  const favoriteSongs = useFavoriteStore.getState().songs;
  const removedFavoriteSongs = favoriteSongs.filter((song) =>
    removedSongIds.includes(song.id),
  );
  const removedResources = resources.filter(
    (resource) =>
      (resource.resourceType === input.resourceType &&
        resource.resourceId === input.resourceId) ||
      (resource.resourceType === "songs" &&
        cascadedSongIds.has(resource.resourceId)) ||
      (resource.resourceType === "music-videos" &&
        cascadedMusicVideoIds.has(resource.resourceId)) ||
      (resource.resourceType === "albums" &&
        resource.resourceId === removedEmptyAlbumId),
  );
  const recentlyPlayedEntry =
    input.resourceType === "playlists" && input.sourceOrigin === "user-playlist"
      ? removeRecentlyPlayedPlaylistSnapshot(input.resourceId)
      : undefined;

  // A pending optimistic add must not survive a later delete. Otherwise a
  // stale Library response could merge that row back into the local snapshot.
  for (const resource of removedResources) {
    pendingOptimisticLibraryAdditions.delete(
      resourceKey(resource.resourceType, resource.resourceId),
    );
  }
  cachedResources = resources.filter(
    (resource) => !removedResources.includes(resource),
  );
  pendingLibraryRemovalKeys.add(pendingKey);
  // Deleting the final saved Song also removes its now-empty Album. Mark the
  // derived parent as pending in this tab, not only through its change event,
  // so Album cards disappear for the entire Undo window just like a direct
  // Album deletion.
  if (input.resourceType === "songs" && removedEmptyAlbumId) {
    pendingLibraryRemovalKeys.add(resourceKey("albums", removedEmptyAlbumId));
  }
  setPendingCascadeSongs(pendingKey, [...cascadedSongIds]);
  setPendingCascadeMusicVideos(pendingKey, [...cascadedMusicVideoIds]);
  const pendingChange: LibraryResourcesChange = {
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    sourceId,
    sourceOrigin: input.sourceOrigin,
    operation: "pending-remove",
    expiresAt,
    songIds: [...cascadedSongIds],
    musicVideoIds: [...cascadedMusicVideoIds],
  };
  notifyLibraryResourcesChanged(pendingChange);
  broadcastLibraryResourcesChanged(pendingChange);
  if (input.resourceType === "songs" && removedEmptyAlbumId) {
    const parentChange: LibraryResourcesChange = {
      resourceType: "albums",
      resourceId: removedEmptyAlbumId,
      sourceId,
      operation: "pending-remove",
      expiresAt,
    };
    notifyLibraryResourcesChanged(parentChange);
    broadcastLibraryResourcesChanged(parentChange);
  }
  if (wasAlbumFavorite) {
    // Deletion uses an Undo window. Mirror the intended final Favourite state
    // immediately, then restore it if the user presses Undo or commit fails.
    notifyAlbumFavoriteChanged(favoriteAlbumId!, false);
  }
  if (wasPlaylistFavorite) {
    notifyPlaylistFavoriteChanged(input.resourceId, false);
  }
  if (removedFavoriteSongs.length) {
    removeFavoriteSongsFromStore(removedFavoriteSongs.map((song) => song.id));
    for (const song of removedFavoriteSongs) {
      notifyFavoriteChanged(song.id, false);
    }
  }
  if (cascadedSongIds.size) {
    notifyLibraryResourcesChanged({
      resourceType: "songs",
      resourceId: "",
      sourceId,
      operation: "sync",
    });
  }

  let undone = false;
  let committed = false;
  const undoListeners = new Set<() => void>();
  const clearPendingRemoval = () => {
    if (pendingLibraryRemovals.get(pendingKey)?.undo === undo) {
      pendingLibraryRemovals.delete(pendingKey);
    }
    pendingLibraryRemovalKeys.delete(pendingKey);
    if (input.resourceType === "songs" && removedEmptyAlbumId) {
      pendingLibraryRemovalKeys.delete(
        resourceKey("albums", removedEmptyAlbumId),
      );
    }
    clearPendingCascadeSongs(pendingKey);
    clearPendingCascadeMusicVideos(pendingKey);
  };
  const restore = () => {
    restoreRecentlyPlayedPlaylistSnapshot(recentlyPlayedEntry);
    const current = cachedResources ?? [];
    const currentKeys = new Set(
      current.map((resource) =>
        resourceKey(resource.resourceType, resource.resourceId),
      ),
    );
    cachedResources = [
      ...current,
      ...removedResources.filter(
        (resource) =>
          !currentKeys.has(
            resourceKey(resource.resourceType, resource.resourceId),
          ),
      ),
    ];
    const restoreChange: LibraryResourcesChange = {
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      sourceId,
      sourceOrigin: input.sourceOrigin,
      operation: "restore",
    };
    notifyLibraryResourcesChanged(restoreChange);
    broadcastLibraryResourcesChanged(restoreChange);
    if (input.resourceType === "songs" && removedEmptyAlbumId) {
      const parentChange: LibraryResourcesChange = {
        resourceType: "albums",
        resourceId: removedEmptyAlbumId,
        sourceId,
        operation: "restore",
      };
      notifyLibraryResourcesChanged(parentChange);
      broadcastLibraryResourcesChanged(parentChange);
    }
    if (wasAlbumFavorite) {
      notifyAlbumFavoriteChanged(favoriteAlbumId!, true);
    }
    if (wasPlaylistFavorite) {
      notifyPlaylistFavoriteChanged(input.resourceId, true);
    }
    if (removedFavoriteSongs.length) {
      restoreFavoriteSongsToStore(removedFavoriteSongs);
      for (const song of removedFavoriteSongs) {
        notifyFavoriteChanged(song.id, true);
      }
    }
    if (cascadedSongIds.size) {
      notifyLibraryResourcesChanged({
        resourceType: "songs",
        resourceId: "",
        sourceId,
        operation: "sync",
      });
    }
  };

  function undo() {
    if (undone || committed) return;
    undone = true;
    clearPendingRemoval();
    restore();
    undoListeners.forEach((listener) => listener());
  }

  const removal = {
    removedEmptyAlbumId,
    undo,
    onUndo(listener: () => void) {
      undoListeners.add(listener);
      return () => undoListeners.delete(listener);
    },
    async commit() {
      if (undone || committed) return;
      try {
        await removeLibraryResource(
          input.resourceType,
          input.resourceId,
          sourceId,
          input,
        );
        committed = true;
        clearPendingRemoval();
      } catch (error) {
        undone = true;
        clearPendingRemoval();
        restore();
        throw error;
      }
    },
  };

  pendingLibraryRemovals.set(pendingKey, removal);
  return removal;
}

import { http } from "@/lib/api/http";
import {
  getCatalogAlbum,
  getCatalogPlaylistTracks,
} from "@/lib/catalog/catalog.api";
import {
  removeRecentlyPlayedPlaylistSnapshot,
  restoreRecentlyPlayedPlaylistSnapshot,
} from "@/lib/recommendations/recently-played-snapshot";
import { scheduleRealtimeExpiry } from "@/lib/notifications/realtime-expiry";
import type { CatalogArtwork } from "@/lib/catalog/catalog.types";

export type LibraryResourceType = "songs" | "albums" | "playlists";

export type LibraryResourceInput = {
  resourceType: LibraryResourceType;
  resourceId: string;
  title?: string;
  subtitle?: string;
  artworkUrl?: string;
  sourceOrigin?: "catalog" | "favorite" | "user-playlist";
  songIds?: string[];
};

export type LibraryResource = LibraryResourceInput & {
  isPinned: boolean;
  pinnedAt: number;
};

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
};

let cachedResources: LibraryResource[] | null = null;
let cachedAt = 0;
let loadingResources: Promise<LibraryResource[]> | null = null;
let cachedMediaCards: LibraryMediaCardResource[] | null = null;
let mediaCardsCachedAt = 0;
let loadingMediaCards: Promise<LibraryMediaCardResource[]> | null = null;
let mediaCardsVersion = 0;
let libraryResourcesRevision = 0;
const mutationLocks = new Map<string, Promise<unknown>>();
const pendingLibraryRemovals = new Map<string, { undo: () => void }>();
// The server intentionally waits for the Undo window before deleting. This
// registry is the single source of truth for the optimistic interval, so a
// refetch from any Library surface cannot resurrect a pending item.
const pendingLibraryRemovalKeys = new Set<string>();
const pendingCascadeSongIdsByParent = new Map<string, string[]>();
const pendingCascadeSongRefCounts = new Map<string, number>();
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
      scheduleRemotePendingRemovalExpiry(key, change);
    } else if (
      change?.operation === "restore" ||
      change?.operation === "remove"
    ) {
      clearRemotePendingRemovalExpiry(key);
      pendingLibraryRemovalKeys.delete(key);
      clearPendingCascadeSongs(key);
    }
    cachedResources = null;
    cachedAt = 0;
    loadingResources = null;
    notifyLibraryResourcesChanged(change);
  };
}

function setPendingCascadeSongs(parentKey: string, songIds?: string[]) {
  clearPendingCascadeSongs(parentKey);
  const uniqueSongIds = [...new Set(songIds?.filter(Boolean) ?? [])];
  if (!uniqueSongIds.length) return;

  pendingCascadeSongIdsByParent.set(parentKey, uniqueSongIds);
  uniqueSongIds.forEach((songId) => {
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

/**
 * Library cards normally carry these ids from their Catalog projection. This
 * fallback also covers older cached cards and other collection entry points,
 * so pending removal never has to wait for the server-side Undo commit.
 */
async function resolvePendingCascadeSongIds(input: LibraryResourceInput) {
  const suppliedSongIds = uniqueSongIds(input.songIds);
  if (
    suppliedSongIds.length ||
    input.sourceOrigin !== "catalog" ||
    (input.resourceType !== "albums" && input.resourceType !== "playlists")
  ) {
    return suppliedSongIds;
  }

  try {
    const catalog =
      input.resourceType === "albums"
        ? await getCatalogAlbum(input.resourceId)
        : await getCatalogPlaylistTracks(input.resourceId);
    const collection =
      input.resourceType === "albums"
        ? catalog.resources?.albums[input.resourceId]
        : catalog.resources?.playlists[input.resourceId];
    return uniqueSongIds(
      collection?.relationships?.tracks?.data
        ?.filter((track) => track.type === "songs")
        .map((track) => track.id),
    );
  } catch {
    // The server resolves the same source when committing. Returning an empty
    // list preserves deletion behavior if Catalog is temporarily unavailable.
    return suppliedSongIds;
  }
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
export function cancelPendingLibraryResourceRemoval(
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

export async function getLibraryResources() {
  if (cachedResources && Date.now() - cachedAt < LIBRARY_CACHE_TTL_MS) {
    return cachedResources;
  }
  if (loadingResources) return loadingResources;

  loadingResources = http
    .get<{ resources: LibraryResource[] }>("/songs/library/resources")
    .then(({ data }) => {
      cachedResources = data.resources.filter(
        (resource) =>
          !isLibraryResourcePendingRemoval(
            resource.resourceType,
            resource.resourceId,
          ),
      );
      cachedAt = Date.now();
      return cachedResources;
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

  const cascadedSongIds =
    input.sourceOrigin &&
    (input.resourceType === "albums" || input.resourceType === "playlists")
      ? [...new Set(input.songIds?.filter(Boolean) ?? [])]
      : [];
  const isCollectionCascade = Boolean(
    input.sourceOrigin &&
    (input.resourceType === "albums" || input.resourceType === "playlists"),
  );

  if (!cachedResources || (isCollectionCascade && !cascadedSongIds.length)) {
    if (isCollectionCascade && !cascadedSongIds.length) {
      cachedResources = null;
      cachedAt = 0;
    }
    await getLibraryResources();
  }

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
    } else {
      cachedResources = cachedResources.map((resource, index) =>
        index === existingIndex
          ? {
              ...resource,
              title: input.title || resource.title,
              subtitle: input.subtitle || resource.subtitle,
              artworkUrl: input.artworkUrl || resource.artworkUrl,
            }
          : resource,
      );
    }

    if (cascadedSongIds.length) {
      const knownSongIds = new Set(
        cachedResources
          .filter((resource) => resource.resourceType === "songs")
          .map((resource) => resource.resourceId),
      );
      const cascadedSongs = cascadedSongIds
        .filter((songId) => !knownSongIds.has(songId))
        .map((resourceId) => ({
          resourceType: "songs" as const,
          resourceId,
          isPinned: false,
          pinnedAt: 0,
        }));
      if (cascadedSongs.length) {
        cachedResources = [...cachedResources, ...cascadedSongs];
      }
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

  if (isCollectionCascade) {
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

export function pinLibraryResource(
  resourceType: LibraryResourceType,
  resourceId: string,
) {
  return withResourceMutation(resourceType, resourceId, () =>
    pinLibraryResourceInternal(resourceType, resourceId),
  );
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

export function unpinLibraryResource(
  resourceType: LibraryResourceType,
  resourceId: string,
) {
  return withResourceMutation(resourceType, resourceId, () =>
    unpinLibraryResourceInternal(resourceType, resourceId),
  );
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
  cascade?: Pick<LibraryResourceInput, "sourceOrigin" | "songIds">,
) {
  const { data } = await http.delete<{ deletedUserPlaylist?: boolean }>(
    `/songs/library/resources/${resourceType}/${resourceId}`,
    {
      data: cascade,
    },
  );

  const cascadedSongIds =
    cascade?.sourceOrigin &&
    (resourceType === "albums" || resourceType === "playlists")
      ? [...new Set(cascade.songIds?.filter(Boolean) ?? [])]
      : [];
  const isCollectionCascade = Boolean(
    cascade?.sourceOrigin &&
    (resourceType === "albums" || resourceType === "playlists"),
  );

  // Only deleting an owned playlist destroys its listening context. Removing a
  // public playlist from Library must leave Recently Played untouched.
  if (data.deletedUserPlaylist) {
    removeRecentlyPlayedPlaylistSnapshot(resourceId);
  }

  if (isCollectionCascade && !cascadedSongIds.length) {
    cachedResources = null;
    cachedAt = 0;
    await getLibraryResources();
  }

  if (cachedResources) {
    cachedResources = cachedResources.filter(
      (resource) =>
        (resource.resourceType !== resourceType ||
          resource.resourceId !== resourceId) &&
        !(
          resource.resourceType === "songs" &&
          cascadedSongIds.includes(resource.resourceId)
        ),
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

  if (isCollectionCascade) {
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

export function removeLibraryResource(
  resourceType: LibraryResourceType,
  resourceId: string,
  sourceId?: string,
  cascade?: Pick<LibraryResourceInput, "sourceOrigin" | "songIds">,
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
  const pendingKey = resourceKey(input.resourceType, input.resourceId);
  // A second delete of the same item should start from a clean, saved state.
  pendingLibraryRemovals.get(pendingKey)?.undo();

  const [resources, pendingSongIds] = await Promise.all([
    getLibraryResources(),
    resolvePendingCascadeSongIds(input),
  ]);
  const cascadedSongIds =
    input.sourceOrigin &&
    (input.resourceType === "albums" || input.resourceType === "playlists")
      ? new Set(pendingSongIds)
      : new Set<string>();
  const removedResources = resources.filter(
    (resource) =>
      (resource.resourceType === input.resourceType &&
        resource.resourceId === input.resourceId) ||
      (resource.resourceType === "songs" &&
        cascadedSongIds.has(resource.resourceId)),
  );
  const recentlyPlayedEntry =
    input.resourceType === "playlists" && input.sourceOrigin === "user-playlist"
      ? removeRecentlyPlayedPlaylistSnapshot(input.resourceId)
      : undefined;

  cachedResources = resources.filter(
    (resource) => !removedResources.includes(resource),
  );
  pendingLibraryRemovalKeys.add(pendingKey);
  setPendingCascadeSongs(pendingKey, [...cascadedSongIds]);
  const pendingChange: LibraryResourcesChange = {
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    sourceId,
    sourceOrigin: input.sourceOrigin,
    operation: "pending-remove",
    expiresAt,
    songIds: [...cascadedSongIds],
  };
  notifyLibraryResourcesChanged(pendingChange);
  broadcastLibraryResourcesChanged(pendingChange);
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
    clearPendingCascadeSongs(pendingKey);
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

export async function toggleLibraryResource(
  input: LibraryResourceInput,
): Promise<boolean> {
  return withResourceMutation(
    input.resourceType,
    input.resourceId,
    async () => {
      const resources = await getLibraryResources();
      const isSaved = resources.some(
        (resource) =>
          resource.resourceType === input.resourceType &&
          resource.resourceId === input.resourceId,
      );

      if (isSaved) {
        await removeLibraryResourceInternal(
          input.resourceType,
          input.resourceId,
          undefined,
          input,
        );
        return false;
      }

      await addLibraryResourceInternal(input);
      return true;
    },
  );
}

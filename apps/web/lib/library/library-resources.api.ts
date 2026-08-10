import { http } from "@/lib/api/http";
import { removeRecentlyPlayedPlaylistSnapshot } from "@/lib/recommendations/recently-played-snapshot";

export type LibraryResourceType = "albums" | "playlists";

export type LibraryResourceInput = {
  resourceType: LibraryResourceType;
  resourceId: string;
  title?: string;
  subtitle?: string;
  artworkUrl?: string;
};

export type LibraryResource = LibraryResourceInput & {
  isPinned: boolean;
  pinnedAt: number;
};

export type LibraryResourcesChange = Pick<
  LibraryResource,
  "resourceType" | "resourceId"
> & {
  operation?: "add" | "remove" | "pin" | "unpin" | "update";
  sourceId?: string;
};

let cachedResources: LibraryResource[] | null = null;
let cachedAt = 0;
let loadingResources: Promise<LibraryResource[]> | null = null;
const mutationLocks = new Map<string, Promise<unknown>>();
const LIBRARY_RESOURCES_CHANGED_EVENT = "library:resources-changed";
const LIBRARY_CACHE_TTL_MS = 120_000;
const LIBRARY_SYNC_CHANNEL = "library-resources";
const librarySyncChannel =
  typeof window !== "undefined" && "BroadcastChannel" in window
    ? new BroadcastChannel(LIBRARY_SYNC_CHANNEL)
    : null;

function notifyLibraryResourcesChanged(change?: LibraryResourcesChange) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<LibraryResourcesChange | undefined>(
        LIBRARY_RESOURCES_CHANGED_EVENT,
        { detail: change },
      ),
    );
  }
}

function broadcastLibraryResourcesChanged(change: LibraryResourcesChange) {
  librarySyncChannel?.postMessage(change);
}

if (librarySyncChannel) {
  librarySyncChannel.onmessage = () => {
    cachedResources = null;
    cachedAt = 0;
    loadingResources = null;
    notifyLibraryResourcesChanged();
  };
}

function resourceKey(resourceType: LibraryResourceType, resourceId: string) {
  return `${resourceType}:${resourceId}`;
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
      cachedResources = data.resources;
      cachedAt = Date.now();
      return cachedResources;
    })
    .finally(() => {
      loadingResources = null;
    });

  return loadingResources;
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
  await http.post("/songs/library/resources", input);

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
  }

  const change = {
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    sourceId,
    operation: "add" as const,
  };
  notifyLibraryResourcesChanged(change);
  broadcastLibraryResourcesChanged(change);
}

export function addLibraryResource(input: LibraryResourceInput, sourceId?: string) {
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
      resource.resourceType === resourceType && resource.resourceId === resourceId
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
  await http.delete(`/songs/library/resources/${resourceType}/${resourceId}/pin`);

  if (cachedResources) {
    cachedResources = cachedResources.map((resource) =>
      resource.resourceType === resourceType && resource.resourceId === resourceId
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
) {
  const { data } = await http.delete<{ deletedUserPlaylist?: boolean }>(
    `/songs/library/resources/${resourceType}/${resourceId}`,
  );

  // Only deleting an owned playlist destroys its listening context. Removing a
  // public playlist from Library must leave Recently Played untouched.
  if (data.deletedUserPlaylist) {
    removeRecentlyPlayedPlaylistSnapshot(resourceId);
  }

  if (cachedResources) {
    cachedResources = cachedResources.filter(
      (resource) =>
        resource.resourceType !== resourceType || resource.resourceId !== resourceId,
    );
  }

  const change = {
    resourceType,
    resourceId,
    sourceId,
    operation: "remove" as const,
  };
  notifyLibraryResourcesChanged(change);
  broadcastLibraryResourcesChanged(change);
}

export function removeLibraryResource(
  resourceType: LibraryResourceType,
  resourceId: string,
  sourceId?: string,
) {
  return withResourceMutation(resourceType, resourceId, () =>
    removeLibraryResourceInternal(resourceType, resourceId, sourceId),
  );
}

export async function toggleLibraryResource(
  input: LibraryResourceInput,
): Promise<boolean> {
  return withResourceMutation(input.resourceType, input.resourceId, async () => {
    const resources = await getLibraryResources();
    const isSaved = resources.some(
      (resource) =>
        resource.resourceType === input.resourceType &&
        resource.resourceId === input.resourceId,
    );

    if (isSaved) {
      await removeLibraryResourceInternal(input.resourceType, input.resourceId);
      return false;
    }

    await addLibraryResourceInternal(input);
    return true;
  });
}

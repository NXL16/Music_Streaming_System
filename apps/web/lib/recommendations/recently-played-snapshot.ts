import type { HomeShelf } from "./recommendation.mapper";
import type { MediaCardProps } from "@/components/media/media-card.types";
import { RECENTLY_PLAYED_CONTEXT_LIMIT } from "@musical/shared-constants";

let snapshot: HomeShelf | null | undefined;
let snapshotUpdatedAt = 0;
export const RECENTLY_PLAYED_SNAPSHOT_TTL_MS = 60_000;
export const RECENTLY_PLAYED_PLAYLIST_REMOVED_EVENT =
  "recently-played:playlist-removed";
export const RECENTLY_PLAYED_PLAYLIST_RESTORED_EVENT =
  "recently-played:playlist-restored";
export const RECENTLY_PLAYED_PLAYLIST_UPDATED_EVENT =
  "recently-played:playlist-updated";

export type RecentlyPlayedPlaylistSnapshotEntry = {
  item: MediaCardProps;
  index: number;
};

export type RecentlyPlayedPlaylistSnapshotUpdate = {
  playlistId: string;
  title: string;
};

export function getRecentlyPlayedSnapshot() {
  return snapshot;
}

export function setRecentlyPlayedSnapshot(next: HomeShelf | null) {
  snapshot = next;
  snapshotUpdatedAt = Date.now();
}

export function clearRecentlyPlayedSnapshot() {
  snapshot = undefined;
  snapshotUpdatedAt = 0;
}

export function isRecentlyPlayedSnapshotStale() {
  return (
    snapshot === undefined ||
    Date.now() - snapshotUpdatedAt >= RECENTLY_PLAYED_SNAPSHOT_TTL_MS
  );
}

/**
 * Keeps the Back-navigation snapshot current even while Home is unmounted.
 * An undefined snapshot means Home has not fetched yet, so it must remain
 * undefined and let the normal API request populate the complete shelf.
 */
export function prependRecentlyPlayedSnapshot(item: MediaCardProps) {
  if (snapshot === undefined) return;

  const itemKey = `${item.resourceType}:${item.resourceId}`;
  const currentItems = snapshot?.items ?? [];
  snapshot = {
    ...(snapshot ?? {
      id: "user-recently-played",
      title: "Recently Played",
      displayKind: "MusicCoverShelf" as const,
      sourceDisplayKind: "MusicCoverShelf",
      modelVersion: 1,
      hasMore: false,
      items: [],
    }),
    items: [
      item,
      ...currentItems.filter(
        (currentItem) =>
          `${currentItem.resourceType}:${currentItem.resourceId}` !== itemKey,
      ),
    ].slice(0, RECENTLY_PLAYED_CONTEXT_LIMIT),
  };
  snapshotUpdatedAt = Date.now();
}

export function removeRecentlyPlayedPlaylistSnapshot(
  playlistId: string,
): RecentlyPlayedPlaylistSnapshotEntry | undefined {
  const index = snapshot
    ? snapshot.items.findIndex((item) => item.resourceId === playlistId)
    : -1;
  const removedItem = index < 0 ? undefined : snapshot?.items[index];

  if (snapshot) {
    snapshot = {
      ...snapshot,
      // Playlist cards can come from the recommendation API or the optimistic
      // playback source. Their resourceType is not a stable discriminator;
      // playlistId is the canonical identity in both cases.
      items: snapshot.items.filter((item) => item.resourceId !== playlistId),
    };
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<string>(RECENTLY_PLAYED_PLAYLIST_REMOVED_EVENT, {
        detail: playlistId,
      }),
    );
  }

  return removedItem ? { item: removedItem, index } : undefined;
}

export function restoreRecentlyPlayedPlaylistSnapshot(
  entry: RecentlyPlayedPlaylistSnapshotEntry | undefined,
) {
  if (!entry || !snapshot) return;

  snapshot = {
    ...snapshot,
    items: [
      ...snapshot.items.slice(0, entry.index),
      entry.item,
      ...snapshot.items
        .filter((item) => item.resourceId !== entry.item.resourceId)
        .slice(entry.index),
    ],
  };

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<RecentlyPlayedPlaylistSnapshotEntry>(
        RECENTLY_PLAYED_PLAYLIST_RESTORED_EVENT,
        { detail: entry },
      ),
    );
  }
}

export function updateRecentlyPlayedPlaylistSnapshot(
  update: RecentlyPlayedPlaylistSnapshotUpdate,
) {
  if (snapshot) {
    snapshot = {
      ...snapshot,
      items: snapshot.items.map((item) =>
        item.resourceId === update.playlistId
          ? { ...item, title: update.title }
          : item,
      ),
    };
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<RecentlyPlayedPlaylistSnapshotUpdate>(
        RECENTLY_PLAYED_PLAYLIST_UPDATED_EVENT,
        { detail: update },
      ),
    );
  }
}

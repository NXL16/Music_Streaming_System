import type { HomeShelf } from "./recommendation.mapper";
import type { MediaCardProps } from "@/components/media/media-card.types";
import { RECENTLY_PLAYED_CONTEXT_LIMIT } from "@musical/shared-constants";

let snapshot: HomeShelf | null | undefined;
export const RECENTLY_PLAYED_PLAYLIST_REMOVED_EVENT =
  "recently-played:playlist-removed";

export function getRecentlyPlayedSnapshot() {
  return snapshot;
}

export function setRecentlyPlayedSnapshot(next: HomeShelf | null) {
  snapshot = next;
}

export function clearRecentlyPlayedSnapshot() {
  snapshot = undefined;
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
}

export function removeRecentlyPlayedPlaylistSnapshot(playlistId: string) {
  if (snapshot) {
    snapshot = {
      ...snapshot,
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
}

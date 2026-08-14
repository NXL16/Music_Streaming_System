import { useEffect, useState } from "react";
import {
  isLibraryResourcePendingRemoval,
  subscribeLibraryResourcesChanged,
} from "@/lib/library/library-resources.api";
import { useLibraryResourcesRevision } from "@/lib/library/use-library-resources-revision";
import {
  getUserPlaylists,
  invalidateUserPlaylists,
} from "@/lib/playlists/user-playlists.api";
import {
  PLAYLIST_CHANGED_EVENT,
  type PlaylistChange,
} from "@/lib/playlists/playlist-events";

export type UserPlaylist = { id: string; name: string };

export function useUserPlaylists(userId?: string) {
  const [playlists, setPlaylists] = useState<UserPlaylist[]>([]);
  useLibraryResourcesRevision();

  useEffect(() => {
    if (!userId) {
      return;
    }

    let active = true;
    let requestVersion = 0;
    let hasServerSnapshot = false;
    const optimisticPlaylists = new Map<string, UserPlaylist>();
    const pendingRemovedPlaylists = new Map<
      string,
      { playlist: UserPlaylist; index: number }
    >();
    const loadPlaylists = async () => {
      const currentRequestVersion = ++requestVersion;
      try {
        const nextPlaylists = await getUserPlaylists(userId);
        if (active && currentRequestVersion === requestVersion) {
          nextPlaylists.forEach((playlist) =>
            optimisticPlaylists.delete(playlist.id),
          );
          setPlaylists([
            ...[...optimisticPlaylists.values()].filter(
              (playlist) =>
                !nextPlaylists.some((item) => item.id === playlist.id),
            ),
            ...nextPlaylists,
          ]);
          hasServerSnapshot = true;
        }
      } catch {
        // A failed or aborted background refresh must not erase an optimistic
        // creation (or a previously confirmed sidebar list). Only the first
        // load without any local state is allowed to resolve to an empty list.
        if (
          active &&
          currentRequestVersion === requestVersion &&
          !hasServerSnapshot &&
          !optimisticPlaylists.size
        ) {
          setPlaylists([]);
        }
      }
    };

    void loadPlaylists();
    const unsubscribe = subscribeLibraryResourcesChanged((change) => {
      if (change?.resourceType !== "playlists") return;

      if (change.operation === "pending-remove") {
        setPlaylists((current) => {
          const index = current.findIndex(
            (playlist) => playlist.id === change.resourceId,
          );
          if (index < 0) return current;

          pendingRemovedPlaylists.set(change.resourceId, {
            playlist: current[index],
            index,
          });
          return current.filter(
            (playlist) => playlist.id !== change.resourceId,
          );
        });
      } else if (change.operation === "restore") {
        const removedPlaylist = pendingRemovedPlaylists.get(change.resourceId);
        pendingRemovedPlaylists.delete(change.resourceId);
        if (removedPlaylist) {
          setPlaylists((current) => {
            if (current.some((playlist) => playlist.id === change.resourceId)) {
              return current;
            }

            const next = [...current];
            next.splice(
              Math.min(removedPlaylist.index, next.length),
              0,
              removedPlaylist.playlist,
            );
            return next;
          });
        }
      } else if (change.operation === "remove") {
        pendingRemovedPlaylists.delete(change.resourceId);
      }

      invalidateUserPlaylists(userId);
      void loadPlaylists();
    });
    const handlePlaylistChange = (event: Event) => {
      const change = (event as CustomEvent<PlaylistChange>).detail;
      if (
        change?.userId !== userId ||
        change.operation !== "create" ||
        !change.playlist
      ) {
        return;
      }

      optimisticPlaylists.set(change.playlist.id, change.playlist);
      setPlaylists((current) => [
        change.playlist!,
        ...current.filter((playlist) => playlist.id !== change.playlist!.id),
      ]);
    };
    window.addEventListener(PLAYLIST_CHANGED_EVENT, handlePlaylistChange);

    return () => {
      active = false;
      requestVersion += 1;
      unsubscribe();
      window.removeEventListener(PLAYLIST_CHANGED_EVENT, handlePlaylistChange);
    };
  }, [userId]);

  return userId
    ? playlists.filter(
        (playlist) =>
          !isLibraryResourcePendingRemoval("playlists", playlist.id),
      )
    : [];
}

import { invalidateCachedQuery } from "@/lib/api/query-cache";

export const PLAYLIST_CHANGED_EVENT = "playlist:changed";
const PLAYLIST_SYNC_CHANNEL = "playlist-changes";

export type PlaylistChange = {
  playlistId: string;
  userId?: string;
  operation?: "create" | "update";
  playlist?: { id: string; name: string };
};

const playlistSyncChannel =
  typeof window !== "undefined" && "BroadcastChannel" in window
    ? new BroadcastChannel(PLAYLIST_SYNC_CHANNEL)
    : null;

function applyPlaylistChange(change: PlaylistChange) {
  invalidateCachedQuery(`playlist:${change.playlistId}`);
  if (change.userId) {
    invalidateCachedQuery(`user-playlists:${change.userId}`);
  }
  window.dispatchEvent(
    new CustomEvent<PlaylistChange>(PLAYLIST_CHANGED_EVENT, { detail: change }),
  );
}

if (playlistSyncChannel) {
  playlistSyncChannel.onmessage = (event: MessageEvent<PlaylistChange>) => {
    const change = event.data;
    if (!change?.playlistId) return;
    applyPlaylistChange(change);
  };
}

/** Publishes a playlist mutation to every open tab without rebroadcast loops. */
export function notifyPlaylistChanged(
  playlistId: string,
  userId?: string,
  details?: Pick<PlaylistChange, "operation" | "playlist">,
) {
  const change: PlaylistChange = { playlistId, userId, ...details };
  applyPlaylistChange(change);
  playlistSyncChannel?.postMessage(change);
}

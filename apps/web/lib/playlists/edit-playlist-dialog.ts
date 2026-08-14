import type { CollectionMenuContext } from "@/lib/context-menu/types";

export const EDIT_PLAYLIST_DIALOG_EVENT = "playlist:edit-from-menu";

export function openEditPlaylistDialog(playlist: CollectionMenuContext) {
  window.dispatchEvent(
    new CustomEvent<CollectionMenuContext>(EDIT_PLAYLIST_DIALOG_EVENT, {
      detail: playlist,
    }),
  );
}

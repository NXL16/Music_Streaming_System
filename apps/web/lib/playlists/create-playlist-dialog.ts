import type { ContextMenuContext } from "@/lib/context-menu/types";

export const CREATE_PLAYLIST_DIALOG_EVENT = "playlist:create-from-menu";

export function openCreatePlaylistDialog(source: ContextMenuContext) {
  window.dispatchEvent(
    new CustomEvent<ContextMenuContext>(CREATE_PLAYLIST_DIALOG_EVENT, {
      detail: source,
    }),
  );
}

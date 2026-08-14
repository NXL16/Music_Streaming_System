import { songRoute } from "@/lib/catalog/song-route";
import { stationRoute } from "@/lib/recommendations/station-route";
import type { ContextMenuContext } from "./types";

export function contextMenuPath(context: ContextMenuContext): string | null {
  switch (context.kind) {
    case "song":
      return songRoute(context.songId);
    case "station":
      return stationRoute(context.title, context.stationId);
    case "collection":
      if (context.sourceOrigin === "favorite") {
        return "/library/playlist/favorite";
      }
      if (context.sourceOrigin === "user-playlist") {
        return `/library/playlist/${encodeURIComponent(context.resourceId)}`;
      }
      return context.href ?? null;
  }
}

function copyWithSelection(value: string) {
  const element = document.createElement("textarea");
  element.value = value;
  element.setAttribute("readonly", "");
  element.style.position = "fixed";
  element.style.opacity = "0";
  document.body.append(element);
  element.select();
  const copied = document.execCommand("copy");
  element.remove();
  return copied;
}

export async function copyContextMenuLink(context: ContextMenuContext) {
  const path = contextMenuPath(context);
  if (!path || typeof window === "undefined") return false;

  const url = new URL(path, window.location.origin).toString();
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      // Some embedded or non-secure contexts reject Clipboard API access.
    }
  }

  return copyWithSelection(url);
}

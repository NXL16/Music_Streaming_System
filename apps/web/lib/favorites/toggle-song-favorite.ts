import {
  notifyMenuError,
  notifyMenuSuccess,
} from "@/lib/notifications/menu-toast";
import { useFavoriteStore } from "./use-favorite-store";

const pendingToggles = new Map<string, Promise<boolean | null>>();

/** Toggles a song once across all UI surfaces and reports the shared outcome. */
export function toggleSongFavorite(songId: string) {
  const pending = pendingToggles.get(songId);
  if (pending) return pending;

  const request = useFavoriteStore
    .getState()
    .toggle(songId)
    .then((isFavorite) => {
      notifyMenuSuccess(
        isFavorite
          ? "Added to Favourite Songs"
          : "Removed from Favourite Songs",
      );
      return isFavorite;
    })
    .catch(() => {
      notifyMenuError("Couldn't update Favourite Songs");
      return null;
    })
    .finally(() => {
      if (pendingToggles.get(songId) === request) {
        pendingToggles.delete(songId);
      }
    });

  pendingToggles.set(songId, request);
  return request;
}

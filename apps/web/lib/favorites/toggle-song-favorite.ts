import { useAuthStore } from "@/lib/auth/auth-store";
import { librarySongKey } from "@/lib/library/library-song-key";
import {
  notifyMenuError,
  notifyMenuSuccess,
} from "@/lib/notifications/menu-toast";
import { useFavoriteStore } from "./use-favorite-store";

const pendingToggles = new Map<string, Promise<boolean | null>>();

/** Toggles a song once across all UI surfaces and reports the shared outcome. */
export function toggleSongFavorite(songId: string, sourceAlbumId?: string) {
  const session = useAuthStore.getState().sessionVersion;
  const key = JSON.stringify([session, librarySongKey(songId, sourceAlbumId)]);
  const isCurrent = () => useAuthStore.getState().sessionVersion === session;
  const pending = pendingToggles.get(key);
  if (pending) return pending;

  const request = useFavoriteStore
    .getState()
    .toggle(songId, sourceAlbumId)
    .then((isFavorite) => {
      if (!isCurrent()) return null;
      notifyMenuSuccess(
        isFavorite
          ? "Added to Favourite Songs"
          : "Removed from Favourite Songs",
      );
      return isFavorite;
    })
    .catch(() => {
      if (isCurrent()) notifyMenuError("Couldn't update Favourite Songs");
      return null;
    })
    .finally(() => {
      if (pendingToggles.get(key) === request) {
        pendingToggles.delete(key);
      }
    });

  pendingToggles.set(key, request);
  return request;
}

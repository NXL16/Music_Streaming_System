import { http } from "@/lib/api/http";
import {
  optimisticallyAddLibraryResource,
  revalidateLibraryResources,
  rollbackOptimisticLibraryAddition,
  type LibraryResourceInput,
} from "@/lib/library/library-resources.api";
import {
  isSuggestLessActive,
  setSuggestLess,
} from "@/lib/recommendations/suggest-less.api";
import {
  notifyAlbumFavoriteChanged,
  subscribeAlbumFavoriteChanges,
} from "./album-favorite-events";

type AlbumFavoriteResponse = { success: boolean; isFavorite: boolean };
type AlbumFavoriteIdsResponse = { albumIds: string[] };
export { subscribeAlbumFavoriteChanges };

function endpoint(albumId: string) {
  return `/songs/albums/${encodeURIComponent(albumId)}/favorite`;
}

export async function getAlbumFavorite(albumId: string): Promise<boolean> {
  const response = await http.get<AlbumFavoriteResponse>(endpoint(albumId));
  return response.data.isFavorite;
}

export async function listAlbumFavoriteIds(): Promise<string[]> {
  const response = await http.get<AlbumFavoriteIdsResponse>(
    "/songs/albums/favorites",
  );
  return response.data.albumIds ?? [];
}

export async function setAlbumFavorite(
  albumId: string,
  isFavorite: boolean,
  libraryResource?: Omit<LibraryResourceInput, "resourceType" | "resourceId">,
): Promise<boolean> {
  // Update the UI first. If the request fails, the catch block restores the
  // previous state instead of making the interaction wait for the network.
  let optimisticLibraryAddition: ReturnType<
    typeof optimisticallyAddLibraryResource
  > = [];
  if (isFavorite) {
    // Clear the contradictory negative signal before publishing Favourite.
    // Menu refreshes are synchronous, so this ordering prevents a transient
    // state where both actions are intentionally hidden.
    if (isSuggestLessActive("albums", albumId)) {
      void setSuggestLess("albums", albumId, false).catch(() => undefined);
    }
    optimisticLibraryAddition = optimisticallyAddLibraryResource({
      resourceType: "albums",
      resourceId: albumId,
      ...libraryResource,
    });
    notifyAlbumFavoriteChanged(albumId, true);
  } else {
    notifyAlbumFavoriteChanged(albumId, false);
  }
  try {
    const response = await http.request<AlbumFavoriteResponse>({
      url: endpoint(albumId),
      method: isFavorite ? "POST" : "DELETE",
    });
    const nextValue = response.data.isFavorite;
    if (nextValue !== isFavorite) {
      notifyAlbumFavoriteChanged(albumId, nextValue);
    }
    if (isFavorite) {
      revalidateLibraryResources({
        resourceType: "albums",
        resourceId: albumId,
        operation: "sync",
      });
    }
    return nextValue;
  } catch (error) {
    notifyAlbumFavoriteChanged(albumId, !isFavorite);
    if (isFavorite) {
      rollbackOptimisticLibraryAddition(optimisticLibraryAddition);
    }
    throw error;
  }
}

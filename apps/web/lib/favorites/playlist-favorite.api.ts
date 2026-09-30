import { http } from "@/lib/api/http";
import {
  optimisticallyAddLibraryResource,
  refreshLibraryResources,
  revalidateLibraryResources,
  rollbackOptimisticLibraryAddition,
  type LibraryResourceInput,
} from "@/lib/library/library-resources.api";
import {
  isSuggestLessActive,
  setSuggestLess,
} from "@/lib/recommendations/suggest-less.api";
import { notifyHomeRecommendationsStale } from "@/lib/recommendations/home-revalidation";
import {
  notifyPlaylistFavoriteChanged,
  subscribePlaylistFavoriteChanges,
} from "@/lib/favorites/playlist-favorite-events";

type PlaylistFavoriteResponse = { success: boolean; isFavorite: boolean };
type PlaylistFavoriteIdsResponse = { playlistIds: string[] };

export { subscribePlaylistFavoriteChanges };

function endpoint(playlistId: string) {
  return `/songs/playlists/${encodeURIComponent(playlistId)}/favorite`;
}

export async function listPlaylistFavoriteIds(): Promise<string[]> {
  const response = await http.get<PlaylistFavoriteIdsResponse>(
    "/songs/playlists/favorites",
  );
  return response.data.playlistIds ?? [];
}

export async function setPlaylistFavorite(
  playlistId: string,
  isFavorite: boolean,
  libraryResource?: Omit<LibraryResourceInput, "resourceType" | "resourceId">,
): Promise<boolean> {
  let optimisticLibraryAddition: ReturnType<
    typeof optimisticallyAddLibraryResource
  > = [];
  if (isFavorite) {
    if (isSuggestLessActive("playlists", playlistId)) {
      void setSuggestLess("playlists", playlistId, false).catch(
        () => undefined,
      );
    }
    optimisticLibraryAddition = optimisticallyAddLibraryResource({
      resourceType: "playlists",
      resourceId: playlistId,
      ...libraryResource,
    });
    notifyPlaylistFavoriteChanged(playlistId, true);
  } else {
    notifyPlaylistFavoriteChanged(playlistId, false);
  }

  try {
    const response = await http.request<PlaylistFavoriteResponse>({
      url: endpoint(playlistId),
      method: isFavorite ? "POST" : "DELETE",
    });
    const nextValue = response.data.isFavorite;
    if (nextValue !== isFavorite) {
      notifyPlaylistFavoriteChanged(playlistId, nextValue);
    }
    if (isFavorite) {
      revalidateLibraryResources({
        resourceType: "playlists",
        resourceId: playlistId,
        operation: "sync",
      });
    }
    notifyHomeRecommendationsStale();
    return nextValue;
  } catch (error) {
    notifyPlaylistFavoriteChanged(playlistId, !isFavorite);
    if (isFavorite) {
      rollbackOptimisticLibraryAddition(optimisticLibraryAddition);
      refreshLibraryResources({
        resourceType: "playlists",
        resourceId: playlistId,
        operation: "sync",
      });
    }
    throw error;
  }
}

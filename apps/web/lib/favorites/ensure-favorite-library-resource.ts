import { getArtworkRenditionUrl } from "@/lib/media/artwork";
import type { MediaArtwork } from "@/lib/media/media-card.types";
import {
  addLibraryResource,
  getLibraryResources,
} from "@/lib/library/library-resources.api";
import { listFavoriteSongs } from "@/lib/songs/song.api";

const FAVORITE_RESOURCE_ID = "favorite";
let pendingEnsure: Promise<void> | null = null;

/** Ensures the virtual Favourite playlist is persisted in the user's Library. */
async function ensureFavoriteLibraryResourceInternal() {
  const resources = await getLibraryResources();
  const existing = resources.find(
    (resource) =>
      resource.resourceType === "playlists" &&
      resource.resourceId === FAVORITE_RESOURCE_ID,
  );

  // A pre-existing resource with complete display metadata needs no further
  // work. This keeps normal navigation free of an unnecessary favourite fetch.
  if (existing?.title && existing.artworkUrl) {
    return;
  }

  const { collection } = await listFavoriteSongs();
  const artwork = collection?.artwork as MediaArtwork | undefined;
  await addLibraryResource({
    resourceType: "playlists",
    resourceId: FAVORITE_RESOURCE_ID,
    title: collection?.title || "Favourite Songs",
    subtitle: "You",
    artworkUrl: getArtworkRenditionUrl(artwork, 316),
  });
}

/**
 * Persists Favourite once per browser session flow. Sidebar and Library pages
 * can request this concurrently on first load, so they share one request.
 */
export function ensureFavoriteLibraryResource() {
  if (pendingEnsure) return pendingEnsure;

  const request = ensureFavoriteLibraryResourceInternal().finally(() => {
    pendingEnsure = null;
  });
  pendingEnsure = request;
  return request;
}

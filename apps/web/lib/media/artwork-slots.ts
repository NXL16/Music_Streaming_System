import { getArtworkRenditionUrl, getArtworkSrcSet } from "./artwork";
import type { MediaArtwork } from "./media-card.types";

export const THUMBNAIL_ARTWORK_WIDTHS = [40, 80] as const;
export const COVER_ARTWORK_WIDTHS = [296, 316, 592, 632] as const;
export const HERO_ARTWORK_WIDTHS = [450, 600, 900, 1200] as const;
export const PLAYLIST_ARTWORK_WIDTHS = [
  ...THUMBNAIL_ARTWORK_WIDTHS,
  ...COVER_ARTWORK_WIDTHS,
] as const;

/** Returns the cover renditions needed by shelves and other medium card UI. */
export function getCoverArtwork(
  artwork: MediaArtwork | undefined,
  fallbackUrl = "",
) {
  const imageUrl = getArtworkRenditionUrl(artwork, 316) || fallbackUrl;
  return {
    imageUrl,
    imageSrcSet:
      getArtworkSrcSet(artwork, [...COVER_ARTWORK_WIDTHS]) || imageUrl,
  };
}

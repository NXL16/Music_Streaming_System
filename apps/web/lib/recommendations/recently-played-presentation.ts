import type { MediaCardProps } from "@/lib/media/media-card.types";

export const RECENTLY_PLAYED_SHELF_ID = "user-recently-played";

/**
 * Recently Played represents listening history, not editorial promotion.
 * Preserve station destinations, but render any editorial hero as a compact
 * collection card wherever this shelf is displayed.
 */
export function normalizeRecentlyPlayedCard(
  item: MediaCardProps,
): MediaCardProps {
  if (item.resourceType === "playlists" && item.resourceId === "favorite") {
    return {
      ...item,
      isUserPlaylist: true,
      playlistKind: "favorite",
      slug: "/library/playlist/favorite",
    };
  }

  if (item.cardType !== "hero") return item;

  return {
    ...item,
    cardType: "collection",
    videoSrc: undefined,
  };
}

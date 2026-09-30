export type MediaCardType = "hero" | "collection" | "station" | "circle";

/** The content advisory values supported by the media-card UI contract. */
export type ContentRating = "explicit" | "clean";

export interface MediaCardArtist {
  id: string;
  name: string;
  url: string;
}

/**
 * Canonical artwork metadata. Renderers select the appropriate rendition for
 * their own layout, so the same resource never needs duplicated srcSet data.
 */
export interface MediaArtwork {
  url?: string;
  bgColor?: string;
  textColor1?: string;
  textColor2?: string;
  textColor3?: string;
  textColor4?: string;
  variants?: unknown;
}

/**
 * Canonical model consumed by every card renderer, independent of its source
 * (catalog, recommendation, library, or player state).
 */
export interface MediaCardProps {
  id: string;
  resourceId: string;
  resourceType: string;
  /** Track ids when this collection source already supplied them. */
  songIds?: string[];
  /** True when this playlist comes from the authenticated user's library. */
  isUserPlaylist?: boolean;
  /** Distinguishes virtual system playlists from user-created playlists. */
  playlistKind?: "catalog" | "favorite" | "user";
  cardType: MediaCardType;
  title: string;
  subtitle: string;
  imageUrl: string;
  imageSrcSet: string;
  /** Optional non-square artwork ratio, for example a 16:9 video poster. */
  artworkAspectRatio?: string;
  artwork?: MediaArtwork;
  artworkColors: {
    bg: string;
    main: string;
    textPrimary?: string;
    textSecondary?: string;
    textTertiary?: string;
  };
  typeTag?: string;
  /** Hides the Hero eyebrow when the surrounding shelf already supplies it. */
  showTypeTag?: boolean;
  /** Hides the Hero title while retaining its description. */
  showTitle?: boolean;
  /** Suppresses the supporting copy for card types whose title is sufficient. */
  hideHeroDescription?: boolean;
  description?: string;
  contentRating?: ContentRating;
  isFavorite?: boolean;
  slug?: string;
  videoSrc?: string;
  altText?: string;
  artists?: MediaCardArtist[];
  /** Optional card-specific actions when the resource has no catalog menu. */
  menuItems?: MenuItemData[];
  /** Reuses a catalog context menu when a card represents another media view. */
  menuContext?: import("@/lib/context-menu/types").ContextMenuContext;
  onOpen?: () => void;
  onPlay?: () => void;
}
import type { MenuItemData } from "@/lib/menu/use-menu-store";

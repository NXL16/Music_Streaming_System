export type MediaCardType =
  | "hero"
  | "collection"
  | "station"
  | "circle"
  | "social";

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
  /** True when this playlist comes from the authenticated user's library. */
  isUserPlaylist?: boolean;
  /** Distinguishes virtual system playlists from user-created playlists. */
  playlistKind?: "catalog" | "favorite" | "user";
  cardType: MediaCardType;
  title: string;
  subtitle: string;
  imageUrl: string;
  imageSrcSet: string;
  artwork?: MediaArtwork;
  artworkColors: {
    bg: string;
    main: string;
    textPrimary?: string;
    textSecondary?: string;
    textTertiary?: string;
    textScrimColor?: string;
    textScrimOpacity?: number;
  };
  typeTag?: string;
  description?: string;
  contentRating?: ContentRating;
  slug?: string;
  videoSrc?: string;
  altText?: string;
  artists?: MediaCardArtist[];
  onOpen?: () => void;
  onPlay?: () => void;
}

export type MediaCardType =
  | "hero"
  | "collection"
  | "station"
  | "circle"
  | "social";

export interface MediaCardArtist {
  id: string;
  name: string;
  url: string;
}

export interface MediaCardProps {
  id: string;
  resourceId: string;
  resourceType: string;
  cardType: MediaCardType;
  title: string;
  subtitle: string;
  imageUrl: string;
  imageSrcSet: string;
  artworkColors: {
    bg: string;
    main: string;
    textPrimary?: string;
    textSecondary?: string;
    textScrimColor?: string;
    textScrimOpacity?: number;
  };
  typeTag?: string;
  description?: string;
  slug?: string;
  videoSrc?: string;
  altText?: string;
  artists?: MediaCardArtist[];
}

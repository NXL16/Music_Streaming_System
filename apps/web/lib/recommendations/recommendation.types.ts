export type ResourceType =
  | "albums"
  | "playlists"
  | "stations"
  | "editorial-items"
  | "artists"
  | "songs";

export type RecommendationRef = {
  id: string;
  type: string;
  href: string;
};

export type Artwork = {
  url: string;
  width: number;
  height: number;
  bgColor?: string;
  hasP3?: boolean;
  textColor1?: string;
  textColor2?: string;
  textColor3?: string;
  textColor4?: string;
  alt?: string;
  [key: string]: unknown;
};

export type EditorialVideoAsset = {
  video?: string;
  previewFrame?: Artwork;
  [key: string]: unknown;
};

export type EditorialVideo = Record<string, EditorialVideoAsset>;

export type EditorialNotes = {
  name?: string;
  short?: string;
  standard?: string;
  tag?: string;
  tagline?: string;
  [key: string]: unknown;
};

export type CatalogResourceAttributes = {
  name?: string;
  artistName?: string;
  artistNames?: string | string[];
  curatorName?: string;
  artwork?: Artwork;
  editorialArtwork?: Record<string, Artwork>;
  editorialVideo?: EditorialVideo;
  plainEditorialNotes?: EditorialNotes;
  plainEditorialCard?: Record<string, unknown>;
  description?: {
    short?: string;
    standard?: string;
    [key: string]: unknown;
  };
  url?: string;
  [key: string]: unknown;
};

export type CatalogResource = {
  id: string;
  type: string;
  href: string;
  attributes?: CatalogResourceAttributes;
  relationships?: Record<string, RecommendationRelationship>;
};

export type RecommendationRelationship = {
  href: string;
  data: RecommendationRef[];
};

export type RecommendationSection = {
  id: string;
  type: string;
  href: string;
  attributes?: {
    display?: {
      kind?: string;
      decorations?: string[];
    };
    hasSeeAll?: boolean;
    isGroupRecommendation?: boolean;
    kind?: string;
    nextUpdateDate?: string;
    resourceTypes?: string[];
    title?: {
      stringForDisplay?: string;
    };
    titleWithoutName?: {
      stringForDisplay?: string;
    };
    version?: number;
    headerArtwork?: {
      imageSrcSet: string;
      artworkColors: {
        bg: string;
        main: string;
      };
      altText: string;
    };
    sourceAlbumHref?: string;
    sourceAlbumId?: string;
    sourceAlbumName?: string;
    sourceAlbumUrl?: string;
    sourceAlbumArtworkUrl?: string;
    sourceAlbumArtworkBgColor?: string;
  };
  relationships?: {
    contents?: RecommendationRelationship;
    primaryContent?: RecommendationRelationship;
  };
};

export type RecommendationResponse = {
  data: RecommendationRef[];
  resources?: {
    personalRecommendation: Record<string, RecommendationSection>;
    albums: Record<string, CatalogResource>;
    playlists: Record<string, CatalogResource>;
    stations: Record<string, CatalogResource>;
    editorialItems: Record<string, CatalogResource>;
    artists: Record<string, CatalogResource>;
    songs: Record<string, CatalogResource>;
  };
  meta?: {
    name: string;
    locale: string;
    timezone: string;
    platform: string;
  };
};

export type CatalogReference = {
  id: string;
  type: string;
  href: string;
  meta?: {
    popularity?: number;
  };
};

export type CatalogArtistSongsPage = CatalogResponse & {
  nextCursor?: string;
};

export type CatalogArtwork = {
  url: string;
  bgColor: string;
  textColor1: string;
  textColor2: string;
  textColor3: string;
  textColor4: string;
  width: number;
  height: number;
  hasP3: boolean;
  variants?: {
    renditions?: Array<{
      url?: string;
      width?: number;
      height?: number;
    }>;
  };
};

export type CatalogRelationship = {
  href: string;
  data: CatalogReference[];
};

export type CatalogEditorialNotes = {
  name?: string;
  short?: string;
  standard?: string;
  tag?: string;
  tagline?: string;
  [key: string]: unknown;
};

export type CatalogSongResource = {
  id: string;
  type: "songs";
  href: string;
  attributes: {
    albumName: string;
    artistName: string;
    artwork?: CatalogArtwork;
    audioLocale: string;
    audioTraits: string[];
    composerName: string;
    contentRating: string;
    discNumber: number;
    durationInMillis: number;
    genreNames: string[];
    hasLyrics: boolean;
    hasTimeSyncedLyrics: boolean;
    isrc: string;
    name: string;
    previews: Array<{ url: string }>;
    releaseDate: string;
    trackNumber: number;
    url: string;
  };
  relationships: {
    albums?: CatalogRelationship;
    artists?: CatalogRelationship;
    composers?: CatalogRelationship;
  };
};

export type CatalogAlbumResource = {
  id: string;
  type: "albums";
  href: string;
  attributes: {
    artistName: string;
    artwork?: CatalogArtwork;
    audioTraits: string[];
    contentRating: string;
    copyright: string;
    genreNames: string[];
    isCompilation: boolean;
    isComplete: boolean;
    isPrerelease: boolean;
    isSingle: boolean;
    name: string;
    recordLabel: string;
    releaseDate: string;
    trackCount: number;
    upc: string;
    url: string;
    editorialNotes?: CatalogEditorialNotes;
  };
  relationships: {
    artists?: CatalogRelationship;
    tracks?: CatalogRelationship;
  };
};

export type CatalogPlaylistResource = {
  id: string;
  type: "playlists";
  href: string;
  attributes: {
    artwork?: CatalogArtwork;
    audioTraits: string[];
    curatorName: string;
    descriptionShort: string;
    descriptionStandard: string;
    name: string;
    playlistType: string;
    lastModifiedDate: string;
    url: string;
  };
  relationships: {
    tracks?: CatalogRelationship;
  };
};

export type CatalogArtistResource = {
  id: string;
  type: "artists";
  href: string;
  attributes: {
    name: string;
    url: string;
    artwork?: CatalogArtwork;
    genreNames: string[];
    artworkAssetId?: string;
    editorialVideoAssetId?: string;
    editorialVideo?: {
      primary?: {
        video?: string;
        width?: number;
        height?: number;
        assetId?: string;
        variants?: {
          poster?: {
            url?: string;
            width?: number;
            height?: number;
            variants?: {
              renditions?: Array<{
                url?: string;
                width?: number;
                height?: number;
              }>;
            };
          };
          original?: {
            width?: number;
            height?: number;
            contentType?: string;
            durationMillis?: number;
          };
          renditions?: Array<{
            url?: string;
            width?: number;
            height?: number;
          }>;
        };
        previewFrame?: {
          url?: string;
          width?: number;
          height?: number;
        };
        durationMillis?: number;
      };
    };
  };
};

export type CatalogResponse = {
  data: CatalogReference[];
  resources: {
    albums: Record<string, CatalogAlbumResource>;
    playlists: Record<string, CatalogPlaylistResource>;
    songs: Record<string, CatalogSongResource>;
    artists: Record<string, CatalogArtistResource>;
  };
};

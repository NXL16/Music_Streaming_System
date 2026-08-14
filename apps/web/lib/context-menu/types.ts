type CollectionMenuContextBase = {
  kind: "collection";
  resourceId: string;
  title: string;
  subtitle?: string;
  description?: string;
  artworkUrl?: string;
  /** Canonical relative URL for catalog collections. */
  href?: string;
  songIds?: string[];
  userId?: string;
  inLibrary?: boolean;
  isPinned?: boolean;
};

export type CollectionMenuContext =
  | (CollectionMenuContextBase & {
      resourceType: "albums";
      sourceOrigin: "catalog";
      isUserPlaylist?: false;
    })
  | (CollectionMenuContextBase & {
      resourceType: "playlists";
      sourceOrigin: "catalog";
      isUserPlaylist?: false;
    })
  | (CollectionMenuContextBase & {
      resourceType: "playlists";
      sourceOrigin: "user-playlist";
      isUserPlaylist: true;
    })
  | (CollectionMenuContextBase & {
      resourceType: "playlists";
      sourceOrigin: "favorite";
      isUserPlaylist?: false;
    });

export type StationMenuContext = {
  kind: "station";
  stationId: string;
  title: string;
  userId?: string;
};

export type SongMenuContext = {
  kind: "song";
  songId: string;
  title: string;
  subtitle?: string;
  artworkUrl?: string;
  userId?: string;
  inLibrary?: boolean;
  isPinned?: boolean;
  isFavorite?: boolean;
  playlistId?: string;
  /** Queue entry to remove when this menu originates from Up Next. */
  queueItemId?: string;
};

export type ContextMenuContext =
  | CollectionMenuContext
  | StationMenuContext
  | SongMenuContext;

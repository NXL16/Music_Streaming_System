import type { TrackSource } from "@/lib/songs/track-sources";

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
  /** Album context for every track when a collection is copied elsewhere. */
  trackSources?: TrackSource[];
  userId?: string;
  inLibrary?: boolean;
  isPinned?: boolean;
  isFavorite?: boolean;
  isSuggestLess?: boolean;
  /** A Library Detail route treats its persisted album parent as saved. */
  isLibraryView?: boolean;
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

export type ArtistMenuContext = {
  kind: "artist";
  artistId: string;
  title: string;
  /** Canonical public route used by Copy Link. */
  href: string;
  /** The currently rendered primary portrait for Artist Station artwork. */
  artworkUrl?: string;
  isFavorite?: boolean;
};

export type SongMenuContext = {
  kind: "song";
  songId: string;
  /** Public album_tracks UUID for a shareable song-detail URL. */
  releaseTrackId?: string;
  title: string;
  subtitle?: string;
  artworkUrl?: string;
  /** Album being displayed with this song; keeps its row context stable. */
  sourceAlbumId?: string;
  /** Album route for the song-detail menu's Show Album action. */
  albumHref?: string;
  userId?: string;
  inLibrary?: boolean;
  isPinned?: boolean;
  isFavorite?: boolean;
  isSuggestLess?: boolean;
  playlistId?: string;
  /** Queue entry to remove when this menu originates from Up Next. */
  queueItemId?: string;
};

/**
 * A Music Video uses Song actions for its linked Song, but owns its route and
 * must never expose Song-only actions such as Station or credits.
 */
export type VideoMenuContext = Omit<SongMenuContext, "kind"> & {
  kind: "video";
  videoId: string;
  href: string;
};

export type ContextMenuContext =
  | CollectionMenuContext
  | StationMenuContext
  | ArtistMenuContext
  | SongMenuContext
  | VideoMenuContext;

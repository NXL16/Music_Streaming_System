/**
 * Product-level strengths for explicit preference actions. Keep these values
 * in one place: the API records them and the recommendation service applies
 * time decay when it builds a listener profile.
 */
export const PREFERENCE_SIGNAL_WEIGHT = {
  LIBRARY_ADDED: 1,
  LIBRARY_REMOVED: -1,
  ALBUM_FAVOURITED: 5,
  ALBUM_UNFAVOURITED: -5,
  SONG_FAVOURITED: 5,
  SONG_UNFAVOURITED: -5,
  PLAYLIST_FAVOURITED: 5,
  PLAYLIST_UNFAVOURITED: -5,
  PLAYLIST_TRACK_ADDED: 6,
  PLAYLIST_TRACK_REMOVED: -6,
  ARTIST_FOLLOWED: 5,
  ARTIST_UNFOLLOWED: -5,
  SEARCH_CLICKED: 2,
  CONTENT_HIDDEN: -8,
  CONTENT_RESTORED: 8,
  QUEUE_ADDED: 2,
} as const;

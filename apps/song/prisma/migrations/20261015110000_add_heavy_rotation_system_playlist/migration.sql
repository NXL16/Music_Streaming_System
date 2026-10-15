ALTER TABLE "playlists"
DROP CONSTRAINT IF EXISTS "system_personalized_playlist_url_check";

ALTER TABLE "playlists"
ADD CONSTRAINT "system_personalized_playlist_url_check"
CHECK (
  "playlistType" <> 'system-personalized'
  OR "url" IN ('get-up', 'chill', 'new-music', 'heavy-rotation')
);

-- Generated playlists now use opaque UUIDs. These legacy semantic IDs are
-- derived data and will be recreated with their registry-backed UUIDs.
DELETE FROM "playlists"
WHERE "playlistType" = 'system-personalized'
  AND "id" LIKE 'system-playlist-%';

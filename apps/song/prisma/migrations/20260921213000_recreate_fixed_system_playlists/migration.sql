-- The previous implementation incorrectly created a catalog playlist per
-- listener. System-personalized playlists are derived data, so clear only
-- those generated records. The next Global recommendation generation creates
-- the three fixed UUID playlists (Get Up, Chill, New Music).
DELETE FROM "playlists"
WHERE "playlistType" = 'system-personalized';

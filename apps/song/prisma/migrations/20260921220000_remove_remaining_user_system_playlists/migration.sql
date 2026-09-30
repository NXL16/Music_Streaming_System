-- These derived records are recreated only by Global generation. Clearing the
-- remaining old rows guarantees the catalog cannot retain one playlist per
-- listener from a process that was running the retired implementation.
DELETE FROM "playlists"
WHERE "playlistType" = 'system-personalized';

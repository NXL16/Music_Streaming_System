ALTER TABLE "generated_system_playlists"
DROP CONSTRAINT "generated_system_playlists_key_check";

ALTER TABLE "generated_system_playlists"
ADD CONSTRAINT "generated_system_playlists_key_check"
CHECK ("playlistKey" IN ('get-up', 'chill', 'new-music', 'heavy-rotation'));

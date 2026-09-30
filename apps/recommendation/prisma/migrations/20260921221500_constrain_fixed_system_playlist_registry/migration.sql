ALTER TABLE "generated_system_playlists"
ADD CONSTRAINT "generated_system_playlists_global_scope_check"
CHECK ("scopeKey" = 'GLOBAL');

ALTER TABLE "generated_system_playlists"
ADD CONSTRAINT "generated_system_playlists_key_check"
CHECK ("playlistKey" IN ('get-up', 'chill', 'new-music'));

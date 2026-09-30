-- A system playlist is a fixed global product. Rows in another scope were
-- written by the superseded per-user playlist implementation.
DELETE FROM "user_system_playlist_tracks";

DELETE FROM "generated_system_playlists"
WHERE "scopeKey" <> 'GLOBAL';

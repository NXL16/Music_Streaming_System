-- Refresh cadence belongs to the three global editorial playlists, never to
-- individual listeners. User playlist tracks retain their own cache rows.
DELETE FROM "system_playlist_refresh_states"
WHERE "scopeKey" <> 'GLOBAL';

DROP INDEX "system_playlist_refresh_states_scopeKey_refreshedAt_idx";

ALTER TABLE "system_playlist_refresh_states"
  DROP CONSTRAINT "system_playlist_refresh_states_pkey",
  DROP COLUMN "scopeKey",
  ADD CONSTRAINT "system_playlist_refresh_states_pkey" PRIMARY KEY ("playlistKey");

CREATE TABLE "system_playlist_refresh_states" (
  "scopeKey" VARCHAR(256) NOT NULL,
  "playlistKey" VARCHAR(32) NOT NULL,
  "refreshedAt" TIMESTAMPTZ NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "system_playlist_refresh_states_pkey" PRIMARY KEY ("scopeKey", "playlistKey")
);

CREATE INDEX "system_playlist_refresh_states_scopeKey_refreshedAt_idx"
  ON "system_playlist_refresh_states"("scopeKey", "refreshedAt");

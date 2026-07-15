-- Keep the Station context for presentation while recommendation scoring stays song-based.
ALTER TABLE "listening_events"
  ADD COLUMN "stationId" VARCHAR(128) NOT NULL DEFAULT '',
  ADD COLUMN "stationName" VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN "stationArtworkUrl" VARCHAR(1000) NOT NULL DEFAULT '',
  ADD COLUMN "stationArtworkBgColor" VARCHAR(16) NOT NULL DEFAULT '';

ALTER TABLE "user_listening_stats"
  ADD COLUMN "stationId" VARCHAR(128) NOT NULL DEFAULT '',
  ADD COLUMN "stationName" VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN "stationArtworkUrl" VARCHAR(1000) NOT NULL DEFAULT '',
  ADD COLUMN "stationArtworkBgColor" VARCHAR(16) NOT NULL DEFAULT '';

CREATE INDEX "listening_events_stationId_createdAt_idx"
  ON "listening_events"("stationId", "createdAt");

CREATE INDEX "user_listening_stats_stationId_lastPlayedAt_idx"
  ON "user_listening_stats"("stationId", "lastPlayedAt");

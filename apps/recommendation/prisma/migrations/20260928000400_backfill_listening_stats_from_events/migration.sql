-- `user_listening_stats` is the compact source used by the recommendation
-- profile, while Recently Played reads immutable `listening_events`. Older
-- accounts can therefore have a valid event history without aggregate rows.
-- Backfill only missing user/song pairs so live aggregates are never doubled.
WITH aggregate AS (
  SELECT
    "userId",
    "songId",
    COUNT(*) FILTER (
      WHERE "eventType" = 'PLAY_START'
        OR ("eventType" = 'SKIP' AND "durationSec" < 3)
    )::INTEGER AS "playCount",
    COUNT(*) FILTER (WHERE "eventType" = 'PLAY_COMPLETE')::INTEGER
      AS "completionCount",
    COUNT(*) FILTER (WHERE "eventType" = 'SKIP')::INTEGER AS "skipCount",
    COUNT(*) FILTER (
      WHERE "eventType" = 'SKIP' AND "durationSec" < 3
    )::INTEGER AS "earlySkipCount",
    COALESCE(
      SUM("durationSec") FILTER (WHERE "eventType" <> 'PLAY_START'),
      0
    )::INTEGER AS "totalListenSec",
    COALESCE(
      SUM("totalSec") FILTER (WHERE "eventType" <> 'PLAY_START'),
      0
    )::INTEGER AS "totalEligibleSec",
    MAX("createdAt") AS "lastPlayedAt"
  FROM "listening_events"
  GROUP BY "userId", "songId"
),
latest_event AS (
  SELECT DISTINCT ON ("userId", "songId")
    "userId",
    "songId",
    "songTitle",
    "artistName",
    "albumName",
    "albumId",
    "playlistId",
    "playlistName",
    "playlistCuratorName",
    "playlistArtworkUrl",
    "playlistArtworkBgColor",
    "stationId",
    "stationName",
    "stationArtworkUrl",
    "stationArtworkBgColor"
  FROM "listening_events"
  ORDER BY "userId", "songId", "createdAt" DESC, "id" DESC
)
INSERT INTO "user_listening_stats" (
  "id",
  "userId",
  "songId",
  "playCount",
  "completionCount",
  "skipCount",
  "earlySkipCount",
  "totalListenSec",
  "totalEligibleSec",
  "lastPlayedAt",
  "songTitle",
  "artistName",
  "albumName",
  "albumId",
  "playlistId",
  "playlistName",
  "playlistCuratorName",
  "playlistArtworkUrl",
  "playlistArtworkBgColor",
  "stationId",
  "stationName",
  "stationArtworkUrl",
  "stationArtworkBgColor",
  "createdAt",
  "updatedAt"
)
SELECT
  md5('listening-stat:' || aggregate."userId" || ':' || aggregate."songId"),
  aggregate."userId",
  aggregate."songId",
  aggregate."playCount",
  aggregate."completionCount",
  aggregate."skipCount",
  aggregate."earlySkipCount",
  aggregate."totalListenSec",
  aggregate."totalEligibleSec",
  aggregate."lastPlayedAt",
  latest_event."songTitle",
  latest_event."artistName",
  latest_event."albumName",
  latest_event."albumId",
  latest_event."playlistId",
  latest_event."playlistName",
  latest_event."playlistCuratorName",
  latest_event."playlistArtworkUrl",
  latest_event."playlistArtworkBgColor",
  latest_event."stationId",
  latest_event."stationName",
  latest_event."stationArtworkUrl",
  latest_event."stationArtworkBgColor",
  aggregate."lastPlayedAt",
  CURRENT_TIMESTAMP
FROM aggregate
JOIN latest_event
  ON latest_event."userId" = aggregate."userId"
  AND latest_event."songId" = aggregate."songId"
ON CONFLICT ("userId", "songId") DO NOTHING;

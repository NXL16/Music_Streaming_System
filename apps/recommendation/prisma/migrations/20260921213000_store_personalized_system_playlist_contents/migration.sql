-- System playlists are a fixed global catalog of three records. Remove the
-- erroneous user-scoped registry entries and stale references from the former
-- implementation before future generation recreates the three global cards.
DELETE FROM "recommendation_section_items"
WHERE "resourceType" = 'playlists'
  AND "resourceId" LIKE 'system-playlist-%';

DELETE FROM "recommendation_page_resources"
WHERE "resourceType" = 'playlists'
  AND "resourceId" LIKE 'system-playlist-%';

DELETE FROM "recommendation_resource_snapshots"
WHERE "resourceType" = 'playlists'
  AND "resourceId" LIKE 'system-playlist-%';

DELETE FROM "generated_system_playlists"
WHERE "scopeKey" <> 'GLOBAL';

CREATE TABLE "user_system_playlist_tracks" (
    "userId" VARCHAR(128) NOT NULL,
    "playlistKey" VARCHAR(32) NOT NULL,
    "songId" VARCHAR(128) NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_system_playlist_tracks_pkey" PRIMARY KEY ("userId", "playlistKey", "songId")
);

CREATE UNIQUE INDEX "user_system_playlist_tracks_userId_playlistKey_sortOrder_key"
ON "user_system_playlist_tracks"("userId", "playlistKey", "sortOrder");

CREATE INDEX "user_system_playlist_tracks_userId_playlistKey_sortOrder_idx"
ON "user_system_playlist_tracks"("userId", "playlistKey", "sortOrder");

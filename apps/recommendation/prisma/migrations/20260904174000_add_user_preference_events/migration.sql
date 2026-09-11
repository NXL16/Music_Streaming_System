CREATE TYPE "PreferenceEventType" AS ENUM (
  'LIBRARY_ADDED',
  'LIBRARY_REMOVED',
  'ALBUM_FAVOURITED',
  'ALBUM_UNFAVOURITED',
  'SONG_FAVOURITED',
  'SONG_UNFAVOURITED',
  'PLAYLIST_TRACK_ADDED',
  'PLAYLIST_TRACK_REMOVED',
  'ARTIST_FOLLOWED',
  'ARTIST_UNFOLLOWED',
  'SEARCH_CLICKED',
  'CONTENT_HIDDEN'
);

CREATE TABLE "user_preference_events" (
  "id" TEXT NOT NULL,
  "userId" VARCHAR(128) NOT NULL,
  "eventId" VARCHAR(128) NOT NULL,
  "eventType" "PreferenceEventType" NOT NULL,
  "resourceType" VARCHAR(64) NOT NULL,
  "resourceId" VARCHAR(128) NOT NULL,
  "weight" DOUBLE PRECISION NOT NULL,
  "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  CONSTRAINT "user_preference_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_preference_events_eventId_key" ON "user_preference_events"("eventId");
CREATE INDEX "user_preference_events_userId_occurredAt_idx" ON "user_preference_events"("userId", "occurredAt");
CREATE INDEX "user_preference_events_userId_resourceType_resourceId_occurredAt_idx" ON "user_preference_events"("userId", "resourceType", "resourceId", "occurredAt");
CREATE INDEX "user_preference_events_resourceType_resourceId_occurredAt_idx" ON "user_preference_events"("resourceType", "resourceId", "occurredAt");

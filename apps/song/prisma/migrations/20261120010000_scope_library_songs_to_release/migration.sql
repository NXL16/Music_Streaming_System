ALTER TABLE "user_library_resources"
ADD COLUMN "releaseTrackId" VARCHAR(128) NOT NULL DEFAULT '';

UPDATE "user_library_resources" AS library
SET "releaseTrackId" = track."id"::text
FROM "album_tracks" AS track
WHERE library."resourceType" = 'songs'
  AND library."resourceId" = track."songId"
  AND library."sourceAlbumId" = track."albumId";

DROP INDEX "user_library_resources_userId_resourceType_resourceId_key";
CREATE UNIQUE INDEX "user_library_resource_release_key"
ON "user_library_resources"("userId", "resourceType", "resourceId", "releaseTrackId");

ALTER TABLE "favorites"
ADD COLUMN "releaseTrackId" VARCHAR(128) NOT NULL DEFAULT '';

UPDATE "favorites" AS favorite
SET "releaseTrackId" = track."id"::text
FROM "album_tracks" AS track
WHERE favorite."songId" = track."songId"
  AND favorite."sourceAlbumId" = track."albumId";

DROP INDEX "favorites_userId_songId_key";
CREATE UNIQUE INDEX "favorite_release_key"
ON "favorites"("userId", "songId", "releaseTrackId");

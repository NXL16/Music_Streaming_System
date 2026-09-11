-- A release-track is the public identity of a song inside one release.
-- Keep the existing album/song uniqueness while giving each relation a stable
-- UUID that can be used in shareable Song Detail URLs.
ALTER TABLE "album_tracks"
  ADD COLUMN "id" UUID NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE "album_tracks"
  DROP CONSTRAINT "album_tracks_pkey";

ALTER TABLE "album_tracks"
  ADD CONSTRAINT "album_tracks_pkey" PRIMARY KEY ("id");

ALTER TABLE "album_tracks"
  ADD CONSTRAINT "album_tracks_albumId_songId_key" UNIQUE ("albumId", "songId");

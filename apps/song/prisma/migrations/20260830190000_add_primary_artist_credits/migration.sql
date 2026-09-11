ALTER TABLE "album_artist_credits"
  ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "song_artist_credits"
  ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;

-- Legacy credits used position 0 as the only primary artist.
UPDATE "album_artist_credits"
SET "isPrimary" = true
WHERE position = 0;

UPDATE "song_artist_credits"
SET "isPrimary" = true
WHERE role = 'artist' AND position = 0;

CREATE INDEX "album_artist_credits_artistId_isPrimary_idx"
  ON "album_artist_credits"("artistId", "isPrimary");

CREATE INDEX "song_artist_credits_artistId_role_isPrimary_idx"
  ON "song_artist_credits"("artistId", role, "isPrimary");

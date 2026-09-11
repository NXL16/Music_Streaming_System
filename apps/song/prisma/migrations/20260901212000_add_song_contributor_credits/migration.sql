-- Manual song credits are contributors, not catalog Artists. Keeping them in
-- a separate table prevents accidental public Artist records and preserves
-- role/position ordering without nullable composite keys.
CREATE TABLE "song_contributor_credits" (
  "songId" VARCHAR(128) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "role" VARCHAR(32) NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "song_contributor_credits_pkey" PRIMARY KEY ("songId", "role", "position")
);

CREATE INDEX "song_contributor_credits_songId_idx"
  ON "song_contributor_credits"("songId");

ALTER TABLE "song_contributor_credits"
  ADD CONSTRAINT "song_contributor_credits_songId_fkey"
  FOREIGN KEY ("songId") REFERENCES "songs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

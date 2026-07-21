ALTER TABLE "songs"
ADD COLUMN "moodTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "songs_moodTags_idx" ON "songs" USING GIN ("moodTags");

-- CreateIndex
CREATE INDEX "songs_moodTags_idx" ON "songs" USING GIN ("moodTags");

ALTER TABLE "songs"
  ADD COLUMN "moodAnalysisVersion" VARCHAR(128) NOT NULL DEFAULT '',
  ADD COLUMN "moodAnalysisScores" JSONB,
  ADD COLUMN "moodAnalyzedAt" TIMESTAMPTZ;

CREATE INDEX "songs_moodAnalyzedAt_idx" ON "songs"("moodAnalyzedAt");

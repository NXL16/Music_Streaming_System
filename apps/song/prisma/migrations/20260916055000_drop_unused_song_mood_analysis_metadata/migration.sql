DROP INDEX IF EXISTS "songs_moodAnalyzedAt_idx";

ALTER TABLE "songs"
  DROP COLUMN "moodAnalysisVersion",
  DROP COLUMN "moodAnalysisScores",
  DROP COLUMN "moodAnalyzedAt";

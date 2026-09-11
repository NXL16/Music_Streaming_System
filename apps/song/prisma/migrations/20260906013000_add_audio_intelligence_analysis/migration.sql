CREATE TYPE "AudioAnalysisStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

ALTER TABLE "songs"
  ADD COLUMN "audioAnalysisStatus" "AudioAnalysisStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "audioAnalysisVersion" VARCHAR(128) NOT NULL DEFAULT '',
  ADD COLUMN "audioBpm" DOUBLE PRECISION,
  ADD COLUMN "audioEnergy" DOUBLE PRECISION,
  ADD COLUMN "audioTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "audioAnalysisError" VARCHAR(2000) NOT NULL DEFAULT '',
  ADD COLUMN "audioAnalyzedAt" TIMESTAMPTZ;

CREATE INDEX "songs_audioAnalysisStatus_audioAnalyzedAt_idx"
  ON "songs"("audioAnalysisStatus", "audioAnalyzedAt");
CREATE INDEX "songs_audioTags_idx" ON "songs" USING GIN ("audioTags");

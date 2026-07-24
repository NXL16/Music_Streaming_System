-- DropIndex
DROP INDEX "songs_moodTags_idx";

-- AlterTable
ALTER TABLE "albums" ADD COLUMN     "canonicalReleaseId" VARCHAR(128);

-- CreateIndex
CREATE INDEX "albums_canonicalReleaseId_idx" ON "albums"("canonicalReleaseId");

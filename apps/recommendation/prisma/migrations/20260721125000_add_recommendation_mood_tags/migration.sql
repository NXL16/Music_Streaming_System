ALTER TABLE "recommendation_resource_snapshots"
ADD COLUMN "moodTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "recommendation_resource_snapshots_moodTags_idx"
ON "recommendation_resource_snapshots" USING GIN ("moodTags");

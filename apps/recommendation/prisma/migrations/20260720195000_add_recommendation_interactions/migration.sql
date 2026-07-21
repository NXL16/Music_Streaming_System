CREATE TYPE "RecommendationInteractionType" AS ENUM ('IMPRESSION', 'OPEN', 'PLAY', 'DISMISS');

CREATE TABLE "recommendation_interactions" (
    "id" TEXT NOT NULL,
    "userId" VARCHAR(128) NOT NULL,
    "pageId" VARCHAR(128),
    "sectionId" VARCHAR(128) NOT NULL,
    "resourceType" VARCHAR(64) NOT NULL,
    "resourceId" VARCHAR(128) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "modelVersion" INTEGER NOT NULL DEFAULT 1,
    "eventType" "RecommendationInteractionType" NOT NULL,
    "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recommendation_interactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recommendation_interactions_userId_occurredAt_idx"
  ON "recommendation_interactions"("userId", "occurredAt");
CREATE INDEX "recommendation_interactions_sectionId_resourceType_resourceId_eventType_idx"
  ON "recommendation_interactions"("sectionId", "resourceType", "resourceId", "eventType");
CREATE INDEX "recommendation_interactions_resourceType_resourceId_occurredAt_idx"
  ON "recommendation_interactions"("resourceType", "resourceId", "occurredAt");

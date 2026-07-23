-- DropIndex
DROP INDEX "recommendation_resource_snapshots_moodTags_idx";

-- CreateTable
CREATE TABLE "user_recently_played_contexts" (
    "id" TEXT NOT NULL,
    "userId" VARCHAR(128) NOT NULL,
    "resourceType" VARCHAR(32) NOT NULL,
    "resourceId" VARCHAR(128) NOT NULL,
    "lastPlayedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_recently_played_contexts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_recently_played_contexts_userId_lastPlayedAt_idx" ON "user_recently_played_contexts"("userId", "lastPlayedAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_recently_played_contexts_userId_resourceType_resourceI_key" ON "user_recently_played_contexts"("userId", "resourceType", "resourceId");

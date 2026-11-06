CREATE TABLE "user_recent_searches" (
  "id" TEXT NOT NULL,
  "userId" VARCHAR(128) NOT NULL,
  "resourceType" VARCHAR(64) NOT NULL,
  "resourceId" VARCHAR(128) NOT NULL,
  "searchedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_recent_searches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_recent_searches_userId_resourceType_resourceId_key"
  ON "user_recent_searches"("userId", "resourceType", "resourceId");

CREATE INDEX "user_recent_searches_userId_searchedAt_idx"
  ON "user_recent_searches"("userId", "searchedAt" DESC);

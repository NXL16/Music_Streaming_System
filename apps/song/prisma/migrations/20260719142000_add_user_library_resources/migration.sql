CREATE TABLE "user_library_resources" (
  "id" TEXT NOT NULL,
  "userId" VARCHAR(128) NOT NULL,
  "resourceType" VARCHAR(32) NOT NULL,
  "resourceId" VARCHAR(128) NOT NULL,
  "title" VARCHAR(255) NOT NULL DEFAULT '',
  "subtitle" VARCHAR(255) NOT NULL DEFAULT '',
  "artworkUrl" VARCHAR(1000) NOT NULL DEFAULT '',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_library_resources_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_library_resources_userId_resourceType_resourceId_key" ON "user_library_resources"("userId", "resourceType", "resourceId");
CREATE INDEX "user_library_resources_userId_createdAt_idx" ON "user_library_resources"("userId", "createdAt");

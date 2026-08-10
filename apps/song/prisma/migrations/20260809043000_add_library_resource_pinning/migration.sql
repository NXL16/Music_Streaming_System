ALTER TABLE "user_library_resources"
ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "pinnedAt" TIMESTAMPTZ;

CREATE INDEX "user_library_resources_userId_isPinned_pinnedAt_idx"
ON "user_library_resources"("userId", "isPinned", "pinnedAt");

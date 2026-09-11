CREATE TABLE "user_content_preferences" (
  "userId" VARCHAR(128) NOT NULL,
  "resourceType" VARCHAR(64) NOT NULL,
  "resourceId" VARCHAR(128) NOT NULL,
  "isHidden" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_content_preferences_pkey" PRIMARY KEY ("userId", "resourceType", "resourceId")
);

CREATE INDEX "user_content_preferences_userId_isHidden_updatedAt_idx"
ON "user_content_preferences"("userId", "isHidden", "updatedAt");

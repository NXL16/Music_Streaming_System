CREATE TABLE "user_artist_follows" (
  "userId" VARCHAR(128) NOT NULL,
  "artistId" VARCHAR(128) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_artist_follows_pkey" PRIMARY KEY ("userId", "artistId")
);
CREATE INDEX "user_artist_follows_userId_createdAt_idx" ON "user_artist_follows"("userId", "createdAt");

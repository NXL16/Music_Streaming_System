CREATE TABLE "system_playlist_favorites" (
  "id" TEXT NOT NULL,
  "userId" VARCHAR(128) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "system_playlist_favorites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "system_playlist_favorites_userId_key"
  ON "system_playlist_favorites"("userId");

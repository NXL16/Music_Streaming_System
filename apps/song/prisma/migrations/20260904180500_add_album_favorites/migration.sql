CREATE TABLE "album_favorites" (
  "id" TEXT NOT NULL,
  "userId" VARCHAR(128) NOT NULL,
  "albumId" VARCHAR(128) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "album_favorites_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "album_favorites_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "album_favorites_userId_albumId_key" ON "album_favorites"("userId", "albumId");
CREATE INDEX "album_favorites_userId_createdAt_idx" ON "album_favorites"("userId", "createdAt");
CREATE INDEX "album_favorites_albumId_idx" ON "album_favorites"("albumId");

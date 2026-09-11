CREATE TABLE "playlist_favorites" (
  "id" TEXT NOT NULL,
  "userId" VARCHAR(128) NOT NULL,
  "playlistId" VARCHAR(128) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "playlist_favorites_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "playlist_favorites_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "playlist_favorites_userId_playlistId_key" ON "playlist_favorites"("userId", "playlistId");
CREATE INDEX "playlist_favorites_userId_createdAt_idx" ON "playlist_favorites"("userId", "createdAt");
CREATE INDEX "playlist_favorites_playlistId_idx" ON "playlist_favorites"("playlistId");

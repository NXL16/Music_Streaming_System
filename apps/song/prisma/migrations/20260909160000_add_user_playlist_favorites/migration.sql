CREATE TABLE "user_playlist_favorites" (
  "id" TEXT NOT NULL,
  "userId" VARCHAR(128) NOT NULL,
  "playlistId" VARCHAR(128) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_playlist_favorites_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_playlist_favorites_playlistId_fkey"
    FOREIGN KEY ("playlistId") REFERENCES "user_playlists"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "user_playlist_favorites_userId_playlistId_key"
  ON "user_playlist_favorites"("userId", "playlistId");
CREATE INDEX "user_playlist_favorites_userId_createdAt_idx"
  ON "user_playlist_favorites"("userId", "createdAt");
CREATE INDEX "user_playlist_favorites_playlistId_idx"
  ON "user_playlist_favorites"("playlistId");

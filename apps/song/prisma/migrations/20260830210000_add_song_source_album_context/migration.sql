ALTER TABLE "favorites" ADD COLUMN "sourceAlbumId" VARCHAR(128);
ALTER TABLE "user_playlist_tracks" ADD COLUMN "sourceAlbumId" VARCHAR(128);

CREATE INDEX "favorites_sourceAlbumId_idx" ON "favorites"("sourceAlbumId");
CREATE INDEX "user_playlist_tracks_sourceAlbumId_idx" ON "user_playlist_tracks"("sourceAlbumId");

ALTER TABLE "favorites"
  ADD CONSTRAINT "favorites_sourceAlbumId_fkey"
  FOREIGN KEY ("sourceAlbumId") REFERENCES "albums"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_playlist_tracks"
  ADD CONSTRAINT "user_playlist_tracks_sourceAlbumId_fkey"
  FOREIGN KEY ("sourceAlbumId") REFERENCES "albums"("id") ON DELETE SET NULL ON UPDATE CASCADE;

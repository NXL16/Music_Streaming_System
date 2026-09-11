ALTER TABLE "user_library_resources" ADD COLUMN "sourceAlbumId" VARCHAR(128);

CREATE INDEX "user_library_resources_sourceAlbumId_idx"
  ON "user_library_resources"("sourceAlbumId");

ALTER TABLE "user_library_resources"
  ADD CONSTRAINT "user_library_resources_sourceAlbumId_fkey"
  FOREIGN KEY ("sourceAlbumId") REFERENCES "albums"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

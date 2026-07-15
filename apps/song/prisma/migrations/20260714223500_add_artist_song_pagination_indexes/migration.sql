-- Supports the cursor-paginated catalog artist song listing.
CREATE INDEX "songs_storefront_isCatalog_releaseDate_id_idx"
ON "songs"("storefront", "isCatalog", "releaseDate" DESC, "id" DESC);

CREATE INDEX "song_artist_credits_artistId_songId_idx"
ON "song_artist_credits"("artistId", "songId");

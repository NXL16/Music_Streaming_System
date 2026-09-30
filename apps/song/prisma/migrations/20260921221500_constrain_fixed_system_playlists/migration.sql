ALTER TABLE "playlists"
ADD CONSTRAINT "system_personalized_playlist_url_check"
CHECK (
  "playlistType" <> 'system-personalized'
  OR "url" IN ('get-up', 'chill', 'new-music')
);

CREATE UNIQUE INDEX "system_personalized_playlist_storefront_url_key"
ON "playlists" ("storefront", "url")
WHERE "playlistType" = 'system-personalized';

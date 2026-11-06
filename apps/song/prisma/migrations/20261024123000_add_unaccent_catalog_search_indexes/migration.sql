CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
ALTER EXTENSION pg_trgm SET SCHEMA public;

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
ALTER EXTENSION unaccent SET SCHEMA public;

-- PostgreSQL marks unaccent() as STABLE. An immutable wrapper is required for
-- expression indexes and is safe here because the unaccent dictionary is part
-- of the deployed database configuration.
CREATE OR REPLACE FUNCTION immutable_unaccent(value TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT public.unaccent(value);
$$;

CREATE INDEX "songs_catalog_title_unaccent_trgm_idx"
ON "songs" USING GIN (lower(immutable_unaccent("catalogTitle")) public.gin_trgm_ops)
WHERE "isCatalog" = true;

CREATE INDEX "artists_name_unaccent_trgm_idx"
ON "artists" USING GIN (lower(immutable_unaccent("name")) public.gin_trgm_ops);

CREATE INDEX "albums_name_unaccent_trgm_idx"
ON "albums" USING GIN (lower(immutable_unaccent("name")) public.gin_trgm_ops);

CREATE INDEX "albums_artist_name_unaccent_trgm_idx"
ON "albums" USING GIN (lower(immutable_unaccent("artistName")) public.gin_trgm_ops);

CREATE INDEX "playlists_name_unaccent_trgm_idx"
ON "playlists" USING GIN (lower(immutable_unaccent("name")) public.gin_trgm_ops)
WHERE "isPublic" = true;

CREATE INDEX "playlists_curator_name_unaccent_trgm_idx"
ON "playlists" USING GIN (lower(immutable_unaccent("curatorName")) public.gin_trgm_ops)
WHERE "isPublic" = true;

CREATE INDEX "song_artist_credits_artist_idx"
ON "song_artist_credits" ("artistId", "songId")
WHERE "role" = 'artist';

CREATE INDEX "album_tracks_song_album_idx"
ON "album_tracks" ("songId", "albumId");

CREATE INDEX "album_artist_credits_artist_album_idx"
ON "album_artist_credits" ("artistId", "albumId");

CREATE INDEX "static_lyric_text_unaccent_trgm_idx"
ON "song_static_lyric_lines"
USING GIN (lower(immutable_unaccent("text")) public.gin_trgm_ops);

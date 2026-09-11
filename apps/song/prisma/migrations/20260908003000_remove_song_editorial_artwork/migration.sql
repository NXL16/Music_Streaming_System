-- A reusable audio recording never owns visual artwork. Release artwork is
-- stored on Album; SongOwner remains only for Artist/Admin authorization.
DROP INDEX IF EXISTS "songs_editorialArtworkAssetId_idx";
ALTER TABLE "songs" DROP COLUMN IF EXISTS "editorialArtworkAssetId";
ALTER TABLE "songs" DROP COLUMN IF EXISTS "editorialArtwork";
ALTER TABLE "song_owners" DROP COLUMN IF EXISTS "coverUrl";

-- Artwork belongs to a release (Album), not to a reusable audio recording.
DROP INDEX IF EXISTS "songs_artworkAssetId_idx";
ALTER TABLE "songs" DROP COLUMN IF EXISTS "artworkAssetId";
ALTER TABLE "songs" DROP COLUMN IF EXISTS "artwork";

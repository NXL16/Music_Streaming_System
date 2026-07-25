-- Add profile avatars as a first-class asset purpose.
ALTER TYPE "AssetPurpose" ADD VALUE IF NOT EXISTS 'PROFILE_AVATAR';

-- Assets are owned by the uploader. This prevents one user from binding another
-- user's identical-content asset and permits safe per-owner source object keys.
DROP INDEX IF EXISTS "assets_kind_purpose_checksum_key";
CREATE UNIQUE INDEX "assets_kind_purpose_checksum_createdBy_key"
ON "assets"("kind", "purpose", "checksum", "createdBy");

CREATE TYPE "ArtistMemberRole" AS ENUM (
  'OWNER',
  'MANAGER',
  'EDITOR',
  'PRODUCTION',
  'ANALYST'
);

ALTER TYPE "CatalogDraftStatus" ADD VALUE 'SUBMITTED';
ALTER TYPE "CatalogDraftStatus" ADD VALUE 'CHANGES_REQUESTED';

ALTER TABLE "catalog_drafts"
  ADD COLUMN "submittedAt" TIMESTAMPTZ,
  ADD COLUMN "reviewedAt" TIMESTAMPTZ,
  ADD COLUMN "reviewedBy" VARCHAR(128),
  ADD COLUMN "reviewNote" VARCHAR(2000) NOT NULL DEFAULT '';

CREATE TABLE "artist_memberships" (
    "id" TEXT NOT NULL,
    "artistId" VARCHAR(128) NOT NULL,
    "userId" VARCHAR(128) NOT NULL,
    "role" "ArtistMemberRole" NOT NULL,
    "createdBy" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "artist_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "artist_memberships_artistId_userId_key"
  ON "artist_memberships"("artistId", "userId");
CREATE INDEX "artist_memberships_userId_updatedAt_idx"
  ON "artist_memberships"("userId", "updatedAt");
CREATE INDEX "artist_memberships_artistId_role_idx"
  ON "artist_memberships"("artistId", "role");

ALTER TABLE "artist_memberships"
  ADD CONSTRAINT "artist_memberships_artistId_fkey"
  FOREIGN KEY ("artistId") REFERENCES "artists"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

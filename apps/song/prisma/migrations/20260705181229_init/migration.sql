-- CreateEnum
CREATE TYPE "CatalogDraftStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "catalog_drafts" (
    "id" TEXT NOT NULL,
    "resourceType" VARCHAR(32) NOT NULL,
    "resourceId" VARCHAR(128) NOT NULL,
    "storefront" VARCHAR(8) NOT NULL DEFAULT 'vn',
    "status" "CatalogDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "payload" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" VARCHAR(128) NOT NULL,
    "updatedBy" VARCHAR(128) NOT NULL,
    "publishedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "catalog_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_asset_usage_outbox" (
    "id" TEXT NOT NULL,
    "resourceType" VARCHAR(32) NOT NULL,
    "resourceId" VARCHAR(128) NOT NULL,
    "storefront" VARCHAR(8) NOT NULL,
    "usages" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMPTZ,
    "lastError" VARCHAR(2000) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "catalog_asset_usage_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "songs" (
    "id" TEXT NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 1,
    "sourceObjectPath" VARCHAR(500) NOT NULL DEFAULT '',
    "checksum" VARCHAR(64),
    "fileSizeBytes" BIGINT NOT NULL DEFAULT 0,
    "encryptedFilePath" VARCHAR(500) NOT NULL DEFAULT '',
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "bitrateKbps" INTEGER NOT NULL DEFAULT 0,
    "codec" VARCHAR(32) NOT NULL DEFAULT '',
    "format" VARCHAR(32) NOT NULL DEFAULT 'fmp4',
    "isCatalog" BOOLEAN NOT NULL DEFAULT false,
    "storefront" VARCHAR(8) NOT NULL DEFAULT 'vn',
    "catalogTitle" VARCHAR(255) NOT NULL DEFAULT '',
    "albumName" VARCHAR(255) NOT NULL DEFAULT '',
    "artistName" VARCHAR(500) NOT NULL DEFAULT '',
    "artworkAssetId" VARCHAR(128) NOT NULL DEFAULT '',
    "editorialArtworkAssetId" VARCHAR(128) NOT NULL DEFAULT '',
    "artwork" JSONB,
    "editorialArtwork" JSONB,
    "extendedAssetUrls" JSONB,
    "offers" JSONB,
    "audioLocale" VARCHAR(32) NOT NULL DEFAULT '',
    "audioTraits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "composerName" VARCHAR(1000) NOT NULL DEFAULT '',
    "discNumber" INTEGER NOT NULL DEFAULT 1,
    "durationInMillis" INTEGER NOT NULL DEFAULT 0,
    "genreNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hasLyrics" BOOLEAN NOT NULL DEFAULT false,
    "hasTimeSyncedLyrics" BOOLEAN NOT NULL DEFAULT false,
    "isHighResolutionMaster" BOOLEAN NOT NULL DEFAULT false,
    "isStudioMastered" BOOLEAN NOT NULL DEFAULT false,
    "isVocalAttenuationAllowed" BOOLEAN NOT NULL DEFAULT false,
    "isrc" VARCHAR(32),
    "previewUrl" VARCHAR(1000) NOT NULL DEFAULT '',
    "releaseDate" DATE,
    "trackNumber" INTEGER NOT NULL DEFAULT 0,
    "catalogUrl" VARCHAR(1000) NOT NULL DEFAULT '',
    "contentRating" VARCHAR(32) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "songs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artists" (
    "id" VARCHAR(128) NOT NULL,
    "storefront" VARCHAR(8) NOT NULL DEFAULT 'vn',
    "name" VARCHAR(255) NOT NULL,
    "url" VARCHAR(1000) NOT NULL DEFAULT '',
    "artworkAssetId" VARCHAR(128) NOT NULL DEFAULT '',
    "artwork" JSONB,
    "genreNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "artists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "albums" (
    "id" VARCHAR(128) NOT NULL,
    "storefront" VARCHAR(8) NOT NULL DEFAULT 'vn',
    "name" VARCHAR(255) NOT NULL,
    "artistName" VARCHAR(500) NOT NULL DEFAULT '',
    "artworkAssetId" VARCHAR(128) NOT NULL DEFAULT '',
    "editorialArtworkAssetId" VARCHAR(128) NOT NULL DEFAULT '',
    "editorialVideoAssetId" VARCHAR(128) NOT NULL DEFAULT '',
    "artwork" JSONB,
    "editorialArtwork" JSONB,
    "editorialNotes" JSONB,
    "editorialVideo" JSONB,
    "offers" JSONB,
    "audioTraits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contentRating" VARCHAR(32) NOT NULL DEFAULT '',
    "copyright" VARCHAR(1000) NOT NULL DEFAULT '',
    "genreNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isCompilation" BOOLEAN NOT NULL DEFAULT false,
    "isComplete" BOOLEAN NOT NULL DEFAULT true,
    "isStudioMastered" BOOLEAN NOT NULL DEFAULT false,
    "isPrerelease" BOOLEAN NOT NULL DEFAULT false,
    "isSingle" BOOLEAN NOT NULL DEFAULT false,
    "recordLabel" VARCHAR(255) NOT NULL DEFAULT '',
    "releaseDate" DATE,
    "trackCount" INTEGER NOT NULL DEFAULT 0,
    "upc" VARCHAR(64) NOT NULL DEFAULT '',
    "url" VARCHAR(1000) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "albums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "album_tracks" (
    "albumId" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "discNumber" INTEGER NOT NULL DEFAULT 1,
    "popularity" DOUBLE PRECISION,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "album_tracks_pkey" PRIMARY KEY ("albumId","songId")
);

-- CreateTable
CREATE TABLE "album_artist_credits" (
    "albumId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "album_artist_credits_pkey" PRIMARY KEY ("albumId","artistId")
);

-- CreateTable
CREATE TABLE "song_artist_credits" (
    "songId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "role" VARCHAR(32) NOT NULL DEFAULT 'artist',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "song_artist_credits_pkey" PRIMARY KEY ("songId","artistId","role")
);

-- CreateTable
CREATE TABLE "playlists" (
    "id" VARCHAR(128) NOT NULL,
    "storefront" VARCHAR(8) NOT NULL DEFAULT 'vn',
    "name" VARCHAR(255) NOT NULL,
    "curatorName" VARCHAR(255) NOT NULL DEFAULT '',
    "descriptionShort" VARCHAR(1000) NOT NULL DEFAULT '',
    "descriptionStandard" TEXT NOT NULL DEFAULT '',
    "artworkAssetId" VARCHAR(128) NOT NULL DEFAULT '',
    "editorialArtworkAssetId" VARCHAR(128) NOT NULL DEFAULT '',
    "editorialVideoAssetId" VARCHAR(128) NOT NULL DEFAULT '',
    "artwork" JSONB,
    "editorialArtwork" JSONB,
    "editorialNotes" JSONB,
    "editorialVideo" JSONB,
    "plainEditorialCard" JSONB,
    "plainEditorialNotes" JSONB,
    "artistNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "audioTraits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "editorialPlaylistKind" VARCHAR(64) NOT NULL DEFAULT '',
    "hasCollaboration" BOOLEAN NOT NULL DEFAULT false,
    "isChart" BOOLEAN NOT NULL DEFAULT false,
    "playlistType" VARCHAR(32) NOT NULL DEFAULT 'editorial',
    "supportsSing" BOOLEAN NOT NULL DEFAULT false,
    "versionHash" VARCHAR(128) NOT NULL DEFAULT '',
    "lastModifiedAt" TIMESTAMPTZ,
    "url" VARCHAR(1000) NOT NULL DEFAULT '',
    "ownerId" VARCHAR(128) NOT NULL DEFAULT '',
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "playlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playlist_tracks" (
    "playlistId" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "addedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playlist_tracks_pkey" PRIMARY KEY ("playlistId","songId")
);

-- CreateTable
CREATE TABLE "song_owners" (
    "id" TEXT NOT NULL,
    "songId" VARCHAR(128) NOT NULL,
    "userId" VARCHAR(128) NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "title" VARCHAR(255) NOT NULL DEFAULT '',
    "artist" VARCHAR(255) NOT NULL DEFAULT '',
    "album" VARCHAR(255) NOT NULL DEFAULT '',
    "coverUrl" VARCHAR(500) NOT NULL DEFAULT '',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "song_owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_cleanup_outbox" (
    "id" TEXT NOT NULL,
    "songId" VARCHAR(128) NOT NULL,
    "sourceObjectPath" VARCHAR(500) NOT NULL DEFAULT '',
    "encryptedFilePath" VARCHAR(500) NOT NULL DEFAULT '',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" VARCHAR(1000) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "asset_cleanup_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "id" TEXT NOT NULL,
    "userId" VARCHAR(128) NOT NULL,
    "songId" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_playlists" (
    "id" TEXT NOT NULL,
    "userId" VARCHAR(128) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" VARCHAR(1000) NOT NULL DEFAULT '',
    "coverUrl" VARCHAR(500) NOT NULL DEFAULT '',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_playlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_playlist_tracks" (
    "playlistId" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "addedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_playlist_tracks_pkey" PRIMARY KEY ("playlistId","songId")
);

-- CreateIndex
CREATE INDEX "catalog_drafts_status_resourceType_storefront_updatedAt_idx" ON "catalog_drafts"("status", "resourceType", "storefront", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_drafts_resourceType_resourceId_storefront_key" ON "catalog_drafts"("resourceType", "resourceId", "storefront");

-- CreateIndex
CREATE INDEX "catalog_asset_usage_outbox_availableAt_lockedAt_idx" ON "catalog_asset_usage_outbox"("availableAt", "lockedAt");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_asset_usage_outbox_resourceType_resourceId_storefro_key" ON "catalog_asset_usage_outbox"("resourceType", "resourceId", "storefront");

-- CreateIndex
CREATE UNIQUE INDEX "songs_checksum_key" ON "songs"("checksum");

-- CreateIndex
CREATE INDEX "songs_status_createdAt_idx" ON "songs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "songs_isCatalog_storefront_idx" ON "songs"("isCatalog", "storefront");

-- CreateIndex
CREATE INDEX "songs_catalogTitle_idx" ON "songs"("catalogTitle");

-- CreateIndex
CREATE INDEX "songs_isrc_idx" ON "songs"("isrc");

-- CreateIndex
CREATE INDEX "songs_artworkAssetId_idx" ON "songs"("artworkAssetId");

-- CreateIndex
CREATE INDEX "songs_editorialArtworkAssetId_idx" ON "songs"("editorialArtworkAssetId");

-- CreateIndex
CREATE INDEX "artists_storefront_name_idx" ON "artists"("storefront", "name");

-- CreateIndex
CREATE INDEX "artists_artworkAssetId_idx" ON "artists"("artworkAssetId");

-- CreateIndex
CREATE INDEX "albums_storefront_name_idx" ON "albums"("storefront", "name");

-- CreateIndex
CREATE INDEX "albums_releaseDate_idx" ON "albums"("releaseDate");

-- CreateIndex
CREATE INDEX "albums_artworkAssetId_idx" ON "albums"("artworkAssetId");

-- CreateIndex
CREATE INDEX "albums_editorialArtworkAssetId_idx" ON "albums"("editorialArtworkAssetId");

-- CreateIndex
CREATE INDEX "albums_editorialVideoAssetId_idx" ON "albums"("editorialVideoAssetId");

-- CreateIndex
CREATE INDEX "album_tracks_songId_idx" ON "album_tracks"("songId");

-- CreateIndex
CREATE UNIQUE INDEX "album_tracks_albumId_position_key" ON "album_tracks"("albumId", "position");

-- CreateIndex
CREATE INDEX "album_artist_credits_artistId_idx" ON "album_artist_credits"("artistId");

-- CreateIndex
CREATE UNIQUE INDEX "album_artist_credits_albumId_position_key" ON "album_artist_credits"("albumId", "position");

-- CreateIndex
CREATE INDEX "song_artist_credits_artistId_idx" ON "song_artist_credits"("artistId");

-- CreateIndex
CREATE UNIQUE INDEX "song_artist_credits_songId_role_position_key" ON "song_artist_credits"("songId", "role", "position");

-- CreateIndex
CREATE INDEX "playlists_storefront_name_idx" ON "playlists"("storefront", "name");

-- CreateIndex
CREATE INDEX "playlists_ownerId_idx" ON "playlists"("ownerId");

-- CreateIndex
CREATE INDEX "playlists_artworkAssetId_idx" ON "playlists"("artworkAssetId");

-- CreateIndex
CREATE INDEX "playlists_editorialArtworkAssetId_idx" ON "playlists"("editorialArtworkAssetId");

-- CreateIndex
CREATE INDEX "playlists_editorialVideoAssetId_idx" ON "playlists"("editorialVideoAssetId");

-- CreateIndex
CREATE INDEX "playlist_tracks_songId_idx" ON "playlist_tracks"("songId");

-- CreateIndex
CREATE UNIQUE INDEX "playlist_tracks_playlistId_position_key" ON "playlist_tracks"("playlistId", "position");

-- CreateIndex
CREATE INDEX "song_owners_userId_idx" ON "song_owners"("userId");

-- CreateIndex
CREATE INDEX "song_owners_userId_isPublic_idx" ON "song_owners"("userId", "isPublic");

-- CreateIndex
CREATE UNIQUE INDEX "song_owners_songId_userId_key" ON "song_owners"("songId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "asset_cleanup_outbox_songId_key" ON "asset_cleanup_outbox"("songId");

-- CreateIndex
CREATE INDEX "asset_cleanup_outbox_createdAt_idx" ON "asset_cleanup_outbox"("createdAt");

-- CreateIndex
CREATE INDEX "favorites_userId_createdAt_idx" ON "favorites"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "favorites_songId_idx" ON "favorites"("songId");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_userId_songId_key" ON "favorites"("userId", "songId");

-- CreateIndex
CREATE INDEX "user_playlists_userId_createdAt_idx" ON "user_playlists"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "user_playlists_isPublic_updatedAt_idx" ON "user_playlists"("isPublic", "updatedAt");

-- CreateIndex
CREATE INDEX "user_playlist_tracks_songId_idx" ON "user_playlist_tracks"("songId");

-- CreateIndex
CREATE UNIQUE INDEX "user_playlist_tracks_playlistId_position_key" ON "user_playlist_tracks"("playlistId", "position");

-- AddForeignKey
ALTER TABLE "album_tracks" ADD CONSTRAINT "album_tracks_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "album_tracks" ADD CONSTRAINT "album_tracks_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "album_artist_credits" ADD CONSTRAINT "album_artist_credits_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "album_artist_credits" ADD CONSTRAINT "album_artist_credits_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_artist_credits" ADD CONSTRAINT "song_artist_credits_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_artist_credits" ADD CONSTRAINT "song_artist_credits_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_tracks" ADD CONSTRAINT "playlist_tracks_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_tracks" ADD CONSTRAINT "playlist_tracks_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_owners" ADD CONSTRAINT "song_owners_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_playlist_tracks" ADD CONSTRAINT "user_playlist_tracks_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "user_playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_playlist_tracks" ADD CONSTRAINT "user_playlist_tracks_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "RecommendationPageScope" AS ENUM ('GLOBAL', 'USER');

-- CreateEnum
CREATE TYPE "RecommendationPageStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RecommendationPresentationMode" AS ENUM ('AUTO', 'FIXED');

-- CreateTable
CREATE TABLE "recommendation_pages" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "scope" "RecommendationPageScope" NOT NULL DEFAULT 'USER',
    "scopeKey" VARCHAR(160) NOT NULL,
    "userId" VARCHAR(128),
    "status" "RecommendationPageStatus" NOT NULL DEFAULT 'DRAFT',
    "locale" VARCHAR(16) NOT NULL DEFAULT 'en-GB',
    "timezone" VARCHAR(16) NOT NULL DEFAULT '+07:00',
    "publishedAt" TIMESTAMPTZ,
    "staleAfter" TIMESTAMPTZ,
    "createdBy" VARCHAR(128) NOT NULL DEFAULT '',
    "updatedBy" VARCHAR(128) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "recommendation_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_page_resources" (
    "pageId" TEXT NOT NULL,
    "resourceType" VARCHAR(64) NOT NULL,
    "resourceId" VARCHAR(128) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "recommendation_page_resources_pkey" PRIMARY KEY ("pageId","resourceType","resourceId")
);

-- CreateTable
CREATE TABLE "recommendation_sections" (
    "id" TEXT NOT NULL,
    "externalId" VARCHAR(128) NOT NULL,
    "pageId" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL DEFAULT '',
    "titleWithoutName" VARCHAR(255) NOT NULL DEFAULT '',
    "presentationMode" "RecommendationPresentationMode" NOT NULL DEFAULT 'FIXED',
    "displayKind" VARCHAR(64) NOT NULL DEFAULT '',
    "displayDecorations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sectionKind" VARCHAR(64) NOT NULL DEFAULT 'music-recommendations',
    "resourceTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hasSeeAll" BOOLEAN NOT NULL DEFAULT false,
    "isGroupRecommendation" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "nextUpdateAt" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 1,
    "attributes" JSONB,
    "relationships" JSONB,
    "raw" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "recommendation_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_section_items" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "resourceType" VARCHAR(64) NOT NULL,
    "resourceId" VARCHAR(128) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "reason" VARCHAR(255) NOT NULL DEFAULT '',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_section_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_resource_snapshots" (
    "id" TEXT NOT NULL,
    "resourceType" VARCHAR(64) NOT NULL,
    "resourceId" VARCHAR(128) NOT NULL,
    "name" VARCHAR(255) NOT NULL DEFAULT '',
    "title" VARCHAR(255) NOT NULL DEFAULT '',
    "subtitle" VARCHAR(500) NOT NULL DEFAULT '',
    "href" VARCHAR(1000) NOT NULL DEFAULT '',
    "externalUrl" VARCHAR(1000) NOT NULL DEFAULT '',
    "artistName" VARCHAR(255) NOT NULL DEFAULT '',
    "artistNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "curatorName" VARCHAR(255) NOT NULL DEFAULT '',
    "artworkUrl" VARCHAR(1000) NOT NULL DEFAULT '',
    "artworkBgColor" VARCHAR(16) NOT NULL DEFAULT '',
    "bgColor" VARCHAR(16) NOT NULL DEFAULT '',
    "textColor1" VARCHAR(16) NOT NULL DEFAULT '',
    "textColor2" VARCHAR(16) NOT NULL DEFAULT '',
    "textColor3" VARCHAR(16) NOT NULL DEFAULT '',
    "textColor4" VARCHAR(16) NOT NULL DEFAULT '',
    "artworkWidth" INTEGER NOT NULL DEFAULT 0,
    "artworkHeight" INTEGER NOT NULL DEFAULT 0,
    "shortDescription" TEXT NOT NULL DEFAULT '',
    "standardDescription" TEXT NOT NULL DEFAULT '',
    "editorialNotesName" VARCHAR(255) NOT NULL DEFAULT '',
    "editorialNotesShort" TEXT NOT NULL DEFAULT '',
    "editorialNotes" TEXT NOT NULL DEFAULT '',
    "audioTraits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "genreNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contentRating" VARCHAR(64) NOT NULL DEFAULT '',
    "copyright" TEXT NOT NULL DEFAULT '',
    "recordLabel" VARCHAR(255) NOT NULL DEFAULT '',
    "releaseDate" VARCHAR(32) NOT NULL DEFAULT '',
    "trackCount" INTEGER NOT NULL DEFAULT 0,
    "upc" VARCHAR(64) NOT NULL DEFAULT '',
    "isCompilation" BOOLEAN NOT NULL DEFAULT false,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "isStudioMastered" BOOLEAN NOT NULL DEFAULT false,
    "isPrerelease" BOOLEAN NOT NULL DEFAULT false,
    "isSingle" BOOLEAN NOT NULL DEFAULT false,
    "playlistType" VARCHAR(64) NOT NULL DEFAULT '',
    "editorialPlaylistKind" VARCHAR(64) NOT NULL DEFAULT '',
    "hasCollaboration" BOOLEAN NOT NULL DEFAULT false,
    "isChart" BOOLEAN NOT NULL DEFAULT false,
    "lastModifiedDate" VARCHAR(64) NOT NULL DEFAULT '',
    "supportsSing" BOOLEAN NOT NULL DEFAULT false,
    "stationKind" VARCHAR(64) NOT NULL DEFAULT '',
    "mediaKind" VARCHAR(64) NOT NULL DEFAULT '',
    "radioUrl" VARCHAR(1000) NOT NULL DEFAULT '',
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "requiresSubscription" BOOLEAN NOT NULL DEFAULT false,
    "linkUrl" VARCHAR(1000) NOT NULL DEFAULT '',
    "playParams" JSONB,
    "editorialArtwork" JSONB,
    "editorialVideo" JSONB,
    "plainEditorialCard" JSONB,
    "plainEditorialNotes" JSONB,
    "attributes" JSONB,
    "relationships" JSONB,
    "raw" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "recommendation_resource_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listening_events" (
    "id" TEXT NOT NULL,
    "userId" VARCHAR(128) NOT NULL,
    "songId" VARCHAR(128) NOT NULL,
    "eventType" VARCHAR(32) NOT NULL,
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "totalSec" INTEGER NOT NULL DEFAULT 0,
    "songTitle" VARCHAR(255) NOT NULL DEFAULT '',
    "artistName" VARCHAR(255) NOT NULL DEFAULT '',
    "albumName" VARCHAR(255) NOT NULL DEFAULT '',
    "albumId" VARCHAR(128) NOT NULL DEFAULT '',
    "playlistId" VARCHAR(128) NOT NULL DEFAULT '',
    "playlistName" VARCHAR(255) NOT NULL DEFAULT '',
    "playlistArtworkUrl" VARCHAR(1000) NOT NULL DEFAULT '',
    "playlistArtworkBgColor" VARCHAR(16) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listening_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_listening_stats" (
    "id" TEXT NOT NULL,
    "userId" VARCHAR(128) NOT NULL,
    "songId" VARCHAR(128) NOT NULL,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "completionCount" INTEGER NOT NULL DEFAULT 0,
    "skipCount" INTEGER NOT NULL DEFAULT 0,
    "totalListenSec" INTEGER NOT NULL DEFAULT 0,
    "lastPlayedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "songTitle" VARCHAR(255) NOT NULL DEFAULT '',
    "artistName" VARCHAR(255) NOT NULL DEFAULT '',
    "albumName" VARCHAR(255) NOT NULL DEFAULT '',
    "albumId" VARCHAR(128) NOT NULL DEFAULT '',
    "playlistId" VARCHAR(128) NOT NULL DEFAULT '',
    "playlistName" VARCHAR(255) NOT NULL DEFAULT '',
    "playlistArtworkUrl" VARCHAR(1000) NOT NULL DEFAULT '',
    "playlistArtworkBgColor" VARCHAR(16) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_listening_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recommendation_pages_userId_name_idx" ON "recommendation_pages"("userId", "name");

-- CreateIndex
CREATE INDEX "recommendation_pages_status_name_locale_idx" ON "recommendation_pages"("status", "name", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_pages_scopeKey_name_locale_timezone_status_key" ON "recommendation_pages"("scopeKey", "name", "locale", "timezone", "status");

-- CreateIndex
CREATE INDEX "recommendation_page_resources_pageId_sortOrder_idx" ON "recommendation_page_resources"("pageId", "sortOrder");

-- CreateIndex
CREATE INDEX "recommendation_page_resources_resourceType_resourceId_idx" ON "recommendation_page_resources"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "recommendation_sections_pageId_sortOrder_idx" ON "recommendation_sections"("pageId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_sections_pageId_externalId_key" ON "recommendation_sections"("pageId", "externalId");

-- CreateIndex
CREATE INDEX "recommendation_section_items_sectionId_sortOrder_idx" ON "recommendation_section_items"("sectionId", "sortOrder");

-- CreateIndex
CREATE INDEX "recommendation_section_items_resourceType_resourceId_idx" ON "recommendation_section_items"("resourceType", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_section_items_sectionId_resourceType_resourc_key" ON "recommendation_section_items"("sectionId", "resourceType", "resourceId", "isPrimary");

-- CreateIndex
CREATE INDEX "recommendation_resource_snapshots_resourceType_idx" ON "recommendation_resource_snapshots"("resourceType");

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_resource_snapshots_resourceType_resourceId_key" ON "recommendation_resource_snapshots"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "listening_events_userId_createdAt_idx" ON "listening_events"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "listening_events_songId_createdAt_idx" ON "listening_events"("songId", "createdAt");

-- CreateIndex
CREATE INDEX "listening_events_albumId_createdAt_idx" ON "listening_events"("albumId", "createdAt");

-- CreateIndex
CREATE INDEX "listening_events_playlistId_createdAt_idx" ON "listening_events"("playlistId", "createdAt");

-- CreateIndex
CREATE INDEX "listening_events_createdAt_idx" ON "listening_events"("createdAt");

-- CreateIndex
CREATE INDEX "user_listening_stats_userId_lastPlayedAt_idx" ON "user_listening_stats"("userId", "lastPlayedAt");

-- CreateIndex
CREATE INDEX "user_listening_stats_userId_playCount_idx" ON "user_listening_stats"("userId", "playCount");

-- CreateIndex
CREATE INDEX "user_listening_stats_songId_playCount_idx" ON "user_listening_stats"("songId", "playCount");

-- CreateIndex
CREATE INDEX "user_listening_stats_albumId_lastPlayedAt_idx" ON "user_listening_stats"("albumId", "lastPlayedAt");

-- CreateIndex
CREATE INDEX "user_listening_stats_playlistId_lastPlayedAt_idx" ON "user_listening_stats"("playlistId", "lastPlayedAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_listening_stats_userId_songId_key" ON "user_listening_stats"("userId", "songId");

-- AddForeignKey
ALTER TABLE "recommendation_page_resources" ADD CONSTRAINT "recommendation_page_resources_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "recommendation_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_page_resources" ADD CONSTRAINT "recommendation_page_resources_resourceType_resourceId_fkey" FOREIGN KEY ("resourceType", "resourceId") REFERENCES "recommendation_resource_snapshots"("resourceType", "resourceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_sections" ADD CONSTRAINT "recommendation_sections_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "recommendation_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_section_items" ADD CONSTRAINT "recommendation_section_items_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "recommendation_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_section_items" ADD CONSTRAINT "recommendation_section_items_resourceType_resourceId_fkey" FOREIGN KEY ("resourceType", "resourceId") REFERENCES "recommendation_resource_snapshots"("resourceType", "resourceId") ON DELETE RESTRICT ON UPDATE CASCADE;

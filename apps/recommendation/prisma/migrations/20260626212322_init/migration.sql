-- CreateTable
CREATE TABLE "recommendation_pages" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "userId" VARCHAR(128) NOT NULL,
    "locale" VARCHAR(16) NOT NULL DEFAULT 'en-GB',
    "timezone" VARCHAR(16) NOT NULL DEFAULT '+07:00',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "recommendation_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_sections" (
    "id" TEXT NOT NULL,
    "externalId" VARCHAR(128) NOT NULL,
    "pageId" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL DEFAULT '',
    "titleWithoutName" VARCHAR(255) NOT NULL DEFAULT '',
    "displayKind" VARCHAR(64) NOT NULL,
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
    "isMasteredForItunes" BOOLEAN NOT NULL DEFAULT false,
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
    "relationships" JSONB,
    "raw" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "recommendation_resource_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recommendation_pages_userId_name_idx" ON "recommendation_pages"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_pages_userId_name_locale_timezone_key" ON "recommendation_pages"("userId", "name", "locale", "timezone");

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

-- AddForeignKey
ALTER TABLE "recommendation_sections" ADD CONSTRAINT "recommendation_sections_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "recommendation_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_section_items" ADD CONSTRAINT "recommendation_section_items_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "recommendation_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_section_items" ADD CONSTRAINT "recommendation_section_items_resourceType_resourceId_fkey" FOREIGN KEY ("resourceType", "resourceId") REFERENCES "recommendation_resource_snapshots"("resourceType", "resourceId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "system_library_collections" (
    "key" VARCHAR(64) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" VARCHAR(1000) NOT NULL DEFAULT '',
    "artworkAssetId" VARCHAR(128) NOT NULL DEFAULT '',
    "artwork" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "system_library_collections_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "system_library_collections_artworkAssetId_idx"
  ON "system_library_collections"("artworkAssetId");

INSERT INTO "system_library_collections" (
  "key", "title", "description", "artworkAssetId", "artwork", "updatedAt"
) VALUES (
  'favorite',
  'Favourite Songs',
  'Songs you loved',
  '383e31cb-b615-48f1-abb2-015c625f348b',
  '{
    "assetId": "383e31cb-b615-48f1-abb2-015c625f348b",
    "url": "https://r2.404hz.me/processed/383e31cb-b615-48f1-abb2-015c625f348b/artwork/610w.webp",
    "width": 610,
    "height": 610,
    "bgColor": "e8e8e8",
    "textColor1": "000000",
    "textColor2": "2a2a2a",
    "textColor3": "545454",
    "textColor4": "7d7d7d",
    "variants": {
      "original": { "width": 610, "height": 610, "contentType": "image/jpeg" },
      "palette": {
        "hasP3": false,
        "bgColor": "e8e8e8",
        "textColor1": "000000",
        "textColor2": "2a2a2a",
        "textColor3": "545454",
        "textColor4": "7d7d7d"
      },
      "renditions": [
        { "url": "https://r2.404hz.me/processed/383e31cb-b615-48f1-abb2-015c625f348b/artwork/40w.webp", "width": 40 },
        { "url": "https://r2.404hz.me/processed/383e31cb-b615-48f1-abb2-015c625f348b/artwork/80w.webp", "width": 80 },
        { "url": "https://r2.404hz.me/processed/383e31cb-b615-48f1-abb2-015c625f348b/artwork/296w.webp", "width": 296 },
        { "url": "https://r2.404hz.me/processed/383e31cb-b615-48f1-abb2-015c625f348b/artwork/316w.webp", "width": 316 },
        { "url": "https://r2.404hz.me/processed/383e31cb-b615-48f1-abb2-015c625f348b/artwork/592w.webp", "width": 592 },
        { "url": "https://r2.404hz.me/processed/383e31cb-b615-48f1-abb2-015c625f348b/artwork/610w.webp", "width": 610 }
      ],
      "hero": {
        "width": 610,
        "height": 814,
        "palette": {
          "bgColor": "eee2e5",
          "textColor1": "000000",
          "textColor2": "3a3a3c",
          "textColor3": "636366",
          "textColor4": "8e8e93"
        },
        "renditions": [
          { "url": "https://r2.404hz.me/processed/383e31cb-b615-48f1-abb2-015c625f348b/artwork/hero/450w.webp", "width": 450 },
          { "url": "https://r2.404hz.me/processed/383e31cb-b615-48f1-abb2-015c625f348b/artwork/hero/600w.webp", "width": 600 },
          { "url": "https://r2.404hz.me/processed/383e31cb-b615-48f1-abb2-015c625f348b/artwork/hero/610w.webp", "width": 610 }
        ]
      }
    }
  }'::jsonb,
  CURRENT_TIMESTAMP
);

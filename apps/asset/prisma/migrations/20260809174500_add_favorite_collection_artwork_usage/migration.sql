INSERT INTO "asset_usages" (
  "id", "assetId", "ownerService", "ownerType", "ownerId", "slot", "updatedAt"
)
SELECT
  '9f15612a-d2cd-4cb6-90c4-bf6f8d681955',
  "id",
  'song',
  'system_library_collection',
  'favorite',
  'artwork',
  CURRENT_TIMESTAMP
FROM "assets"
WHERE "id" = '383e31cb-b615-48f1-abb2-015c625f348b'
ON CONFLICT ("ownerService", "ownerType", "ownerId", "slot", "assetId") DO NOTHING;

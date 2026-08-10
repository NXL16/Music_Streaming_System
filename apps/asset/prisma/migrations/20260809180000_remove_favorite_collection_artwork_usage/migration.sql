DELETE FROM "asset_usages"
WHERE "ownerService" = 'song'
  AND "ownerType" = 'system_library_collection'
  AND "ownerId" = 'favorite'
  AND "slot" = 'artwork';

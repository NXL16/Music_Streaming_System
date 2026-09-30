-- Any system-personalized snapshot from the per-user playlist implementation
-- is derived data. Remove its references and snapshots; Global generation
-- recreates exactly the three shared playlist snapshots.
DELETE FROM "recommendation_section_items"
WHERE "resourceType" = 'playlists'
  AND "resourceId" IN (
    SELECT "resourceId"
    FROM "recommendation_resource_snapshots"
    WHERE "resourceType" = 'playlists'
      AND "attributes" ->> 'playlistType' = 'system-personalized'
  );

DELETE FROM "recommendation_page_resources"
WHERE "resourceType" = 'playlists'
  AND "resourceId" IN (
    SELECT "resourceId"
    FROM "recommendation_resource_snapshots"
    WHERE "resourceType" = 'playlists'
      AND "attributes" ->> 'playlistType' = 'system-personalized'
  );

DELETE FROM "recommendation_resource_snapshots"
WHERE "resourceType" = 'playlists'
  AND "attributes" ->> 'playlistType' = 'system-personalized';

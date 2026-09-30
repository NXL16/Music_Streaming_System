-- Keep recommendation snapshots only for the three UUIDs in the fixed Global
-- registry. Earlier user-scoped implementation snapshots cannot be served.
DELETE FROM "recommendation_section_items"
WHERE "resourceType" = 'playlists'
  AND "resourceId" IN (
    SELECT "resourceId"
    FROM "recommendation_resource_snapshots"
    WHERE "resourceType" = 'playlists'
      AND "playlistType" = 'system-personalized'
      AND "resourceId" NOT IN (
        SELECT "playlistId"
        FROM "generated_system_playlists"
      )
  );

DELETE FROM "recommendation_page_resources"
WHERE "resourceType" = 'playlists'
  AND "resourceId" IN (
    SELECT "resourceId"
    FROM "recommendation_resource_snapshots"
    WHERE "resourceType" = 'playlists'
      AND "playlistType" = 'system-personalized'
      AND "resourceId" NOT IN (
        SELECT "playlistId"
        FROM "generated_system_playlists"
      )
  );

DELETE FROM "recommendation_resource_snapshots"
WHERE "resourceType" = 'playlists'
  AND "playlistType" = 'system-personalized'
  AND "resourceId" NOT IN (
    SELECT "playlistId"
    FROM "generated_system_playlists"
  );

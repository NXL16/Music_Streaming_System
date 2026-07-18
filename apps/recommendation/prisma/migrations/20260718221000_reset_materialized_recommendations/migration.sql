-- The previous engine persisted its presentation output as recommendation
-- pages.  Those rows are not source-of-truth and would otherwise keep serving
-- stale shelves until their TTL expires.  Keep listening history and catalog
-- snapshots: the v2 engine needs both to generate the first new page.
DELETE FROM "recommendation_pages";

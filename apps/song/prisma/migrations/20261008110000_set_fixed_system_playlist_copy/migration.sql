UPDATE "playlists"
SET
  "curatorName" = '404Hz',
  "descriptionShort" = CASE "url"
    WHEN 'new-music' THEN 'Discover new music from artists we think you''ll like. Refreshed every Friday.'
    WHEN 'get-up' THEN 'Whether it’s a weekday morning or Saturday night, get going with this personalised set of upbeat music. Refreshed every Monday.'
    WHEN 'chill' THEN 'Songs to help you relax and unwind. Updated every Sunday.'
  END,
  "descriptionStandard" = CASE "url"
    WHEN 'new-music' THEN 'Discover new music from artists we think you''ll like. Refreshed every Friday.'
    WHEN 'get-up' THEN 'Whether it’s a weekday morning or Saturday night, get going with this personalised set of upbeat music. Refreshed every Monday.'
    WHEN 'chill' THEN 'Songs to help you relax and unwind. Updated every Sunday.'
  END
WHERE "playlistType" = 'system-personalized'
  AND "url" IN ('get-up', 'chill', 'new-music');

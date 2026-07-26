-- Listening metadata comes from user-managed playlists and external catalogs.
-- Keep it as text so valid long names do not prevent analytics from recording.
ALTER TABLE "listening_events"
  ALTER COLUMN "songTitle" TYPE TEXT,
  ALTER COLUMN "artistName" TYPE TEXT,
  ALTER COLUMN "albumName" TYPE TEXT,
  ALTER COLUMN "playlistName" TYPE TEXT,
  ALTER COLUMN "stationName" TYPE TEXT;

ALTER TABLE "user_listening_stats"
  ALTER COLUMN "songTitle" TYPE TEXT,
  ALTER COLUMN "artistName" TYPE TEXT,
  ALTER COLUMN "albumName" TYPE TEXT,
  ALTER COLUMN "playlistName" TYPE TEXT,
  ALTER COLUMN "stationName" TYPE TEXT;

-- Preserve every displayed collaborator in songs.artistName, but create a
-- typed SongArtistCredit whenever its name matches exactly one Artist record.
-- Ambiguous names deliberately remain text-only instead of linking to a
-- potentially different artist page.
WITH parsed_credits AS (
  SELECT
    song."id" AS "songId",
    song."storefront" AS "storefront",
    btrim(part."name") AS "name",
    (part."position" - 1)::INTEGER AS "position"
  FROM "songs" AS song
  CROSS JOIN LATERAL regexp_split_to_table(
    song."artistName",
    E'\\s*(,|&|\\m(and|feat\\.?|ft\\.?)\\M)\\s*'
  ) WITH ORDINALITY AS part("name", "position")
  WHERE song."isCatalog" = TRUE
    AND btrim(song."artistName") <> ''
), matched_credits AS (
  SELECT
    credit."songId",
    artist."id" AS "artistId",
    credit."position",
    count(*) OVER (
      PARTITION BY credit."songId", lower(credit."name")
    ) AS "matchCount"
  FROM parsed_credits AS credit
  INNER JOIN "artists" AS artist
    ON artist."storefront" = credit."storefront"
   AND lower(artist."name") = lower(credit."name")
)
INSERT INTO "song_artist_credits" (
  "songId",
  "artistId",
  "role",
  "position"
)
SELECT
  "songId",
  "artistId",
  'artist',
  "position"
FROM matched_credits
WHERE "matchCount" = 1
-- Existing credits are authoritative. A legacy row may already occupy the
-- same song/role/position with another artist, so skip every unique conflict
-- rather than overwriting or guessing the intended credit.
ON CONFLICT DO NOTHING;

#!/usr/bin/env node

/** Read-only cross-database audit of station/playlist media references. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const requireFromRoot = createRequire(path.join(root, 'package.json'));
const { Client } = requireFromRoot('pg');

function databaseUrl(app) {
  const envPath = path.join(root, `apps/${app}/.env`);
  if (!fs.existsSync(envPath)) throw new Error(`Missing ${envPath}.`);
  const line = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
    .find((entry) => /^\s*DATABASE_URL\s*=/.test(entry));
  const value = line?.replace(/^\s*DATABASE_URL\s*=\s*/, '').trim().replace(/^(['"])(.*)\1$/, '$2');
  if (!value) throw new Error(`Missing DATABASE_URL in ${envPath}.`);
  return value;
}

async function main() {
  const assetDb = new Client({ connectionString: databaseUrl('asset') });
  const songDb = new Client({ connectionString: databaseUrl('song') });
  const recommendationDb = new Client({ connectionString: databaseUrl('recommendation') });
  await Promise.all([assetDb.connect(), songDb.connect(), recommendationDb.connect()]);
  try {
    const catalog = await songDb.query(`
      SELECT 'playlist' AS scope, id AS owner_id, 'cover' AS slot, "artworkAssetId" AS asset_id FROM playlists WHERE "artworkAssetId" <> ''
      UNION ALL SELECT 'playlist', id, 'editorial-artwork', "editorialArtworkAssetId" FROM playlists WHERE "editorialArtworkAssetId" <> ''
      UNION ALL SELECT 'playlist', id, 'editorial-video', "editorialVideoAssetId" FROM playlists WHERE "editorialVideoAssetId" <> ''
    `);
    const generated = await recommendationDb.query(`
      SELECT 'station' AS scope, "stationKey" AS owner_id, 'cover' AS slot, "coverAssetId" AS asset_id FROM system_station_artworks
      UNION ALL SELECT 'station', "stationKey", 'hero-video', "heroVideoAssetId" FROM system_station_artworks WHERE "heroVideoAssetId" IS NOT NULL AND "heroVideoAssetId" <> ''
      UNION ALL SELECT 'system-playlist', "playlistKey", 'cover', "coverAssetId" FROM system_playlist_artworks
      UNION ALL SELECT 'system-playlist', "playlistKey", 'home-card', "homeCardAssetId" FROM system_playlist_artworks
      UNION ALL SELECT 'system-playlist', "playlistKey", 'detail-square-video', "detailSquareVideoAssetId" FROM system_playlist_artworks WHERE "detailSquareVideoAssetId" <> ''
      UNION ALL SELECT 'system-playlist', "playlistKey", 'detail-mobile-video', "detailMobileVideoAssetId" FROM system_playlist_artworks WHERE "detailMobileVideoAssetId" <> ''
      UNION ALL SELECT 'system-playlist', "playlistKey", 'home-hero-video', "homeHeroVideoAssetId" FROM system_playlist_artworks WHERE "homeHeroVideoAssetId" <> ''
    `);
    const storedVideos = await recommendationDb.query(`
      SELECT 'station' AS scope, "stationKey" AS owner_id, 'hero-video' AS slot, "heroVideoAssetId" AS asset_id, "heroVideo" AS media
      FROM system_station_artworks
      WHERE "heroVideoAssetId" IS NOT NULL AND "heroVideoAssetId" <> ''
      UNION ALL SELECT 'system-playlist', "playlistKey", 'detail-square-video', "detailSquareVideoAssetId", "detailSquareVideo"
      FROM system_playlist_artworks WHERE "detailSquareVideoAssetId" <> ''
      UNION ALL SELECT 'system-playlist', "playlistKey", 'detail-mobile-video', "detailMobileVideoAssetId", "detailMobileVideo"
      FROM system_playlist_artworks WHERE "detailMobileVideoAssetId" <> ''
      UNION ALL SELECT 'system-playlist', "playlistKey", 'home-hero-video', "homeHeroVideoAssetId", "homeHeroVideo"
      FROM system_playlist_artworks WHERE "homeHeroVideoAssetId" <> ''
    `);
    const references = [...catalog.rows, ...generated.rows];
    const ids = [...new Set(references.map((row) => row.asset_id))];
    const assets = ids.length === 0
      ? { rows: [] }
      : await assetDb.query(
        'SELECT id, status, kind, purpose, "publicUrl" AS public_url, variants FROM assets WHERE id = ANY($1::text[])',
        [ids],
      );
    const assetsById = new Map(assets.rows.map((asset) => [asset.id, asset]));
    const issues = references.flatMap((reference) => {
      const asset = assetsById.get(reference.asset_id);
      if (!asset) return [{ ...reference, issue: 'ASSET_RECORD_MISSING' }];
      if (asset.status !== 'READY') return [{ ...reference, issue: `ASSET_STATUS_${asset.status}` }];
      if (!asset.public_url || !asset.variants) return [{ ...reference, issue: 'ASSET_OUTPUT_METADATA_MISSING' }];
      return [];
    });
    const staleVideoUrls = storedVideos.rows.flatMap((reference) => {
      const asset = assetsById.get(reference.asset_id);
      const storedUrl = reference.media && typeof reference.media === 'object'
        ? String(reference.media.video ?? '')
        : '';
      return asset?.status === 'READY' && asset.public_url && storedUrl !== asset.public_url
        ? [{ ...reference, storedUrl, currentUrl: asset.public_url }]
        : [];
    });
    const byScope = Object.fromEntries(['playlist', 'station', 'system-playlist'].map((scope) => [
      scope,
      references.filter((reference) => reference.scope === scope).length,
    ]));
    console.log(JSON.stringify({
      references: references.length,
      uniqueAssets: ids.length,
      referencesByScope: byScope,
      resolvedReadyAssets: [...new Set(references.filter((reference) => {
        const asset = assetsById.get(reference.asset_id);
        return asset?.status === 'READY' && Boolean(asset.public_url) && Boolean(asset.variants);
      }).map((reference) => reference.asset_id))].length,
      issueCount: issues.length,
      issues: issues.slice(0, 30),
      staleVideoUrlCount: staleVideoUrls.length,
      staleVideoUrls: staleVideoUrls.slice(0, 30),
    }, null, 2));
    if (issues.length || staleVideoUrls.length) process.exitCode = 1;
  } finally {
    await Promise.all([assetDb.end(), songDb.end(), recommendationDb.end()]);
  }
}

main().catch((error) => {
  console.error(`Station/playlist media audit failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

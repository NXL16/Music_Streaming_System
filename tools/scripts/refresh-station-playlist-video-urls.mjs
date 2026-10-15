#!/usr/bin/env node

/**
 * Repairs stale processed-video URLs in recommendation snapshots after an
 * Asset-service recovery. Asset IDs stay unchanged; only derived URLs/metadata
 * are refreshed from the current READY asset records.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const requireFromRoot = createRequire(path.join(root, 'package.json'));
const { Client } = requireFromRoot('pg');
const apply = process.argv.includes('--apply');

function databaseUrl(app) {
  const envPath = path.join(root, `apps/${app}/.env`);
  if (!fs.existsSync(envPath)) throw new Error(`Missing ${envPath}.`);
  const line = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
    .find((entry) => /^\s*DATABASE_URL\s*=/.test(entry));
  const value = line?.replace(/^\s*DATABASE_URL\s*=\s*/, '').trim().replace(/^(['"])(.*)\1$/, '$2');
  if (!value) throw new Error(`Missing DATABASE_URL in ${envPath}.`);
  return value;
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function string(value) { return typeof value === 'string' ? value : ''; }
function number(value) { return typeof value === 'number' ? value : 0; }

function refreshedVideo(asset) {
  const variants = object(asset.variants);
  const poster = object(variants.poster);
  if (asset.status !== 'READY' || asset.kind !== 'VIDEO' || asset.purpose !== 'EDITORIAL_VIDEO' ||
    !string(asset.public_url) || !string(poster.url)) {
    throw new Error(`Asset ${asset.id} is not a READY editorial video with a poster.`);
  }
  return {
    assetId: asset.id,
    video: asset.public_url,
    width: number(asset.width),
    height: number(asset.height),
    durationMillis: number(asset.duration_millis),
    previewFrame: {
      assetId: asset.id,
      url: string(poster.url),
      width: number(poster.width),
      height: number(poster.height),
      bgColor: string(poster.bgColor),
      variants: object(poster.variants),
    },
    variants,
  };
}

function posterArtwork(video, oldArtwork) {
  const frame = object(video.previewFrame);
  return {
    assetId: string(video.assetId),
    url: string(frame.url),
    width: number(frame.width),
    height: number(frame.height),
    bgColor: string(object(oldArtwork).bgColor) || '2c2c2e',
    variants: object(frame.variants),
  };
}

async function main() {
  const assetDb = new Client({ connectionString: databaseUrl('asset') });
  const recommendationDb = new Client({ connectionString: databaseUrl('recommendation') });
  await Promise.all([assetDb.connect(), recommendationDb.connect()]);
  try {
    const [stations, playlists] = await Promise.all([
      recommendationDb.query('SELECT "stationKey", "heroVideoAssetId", "heroVideo" FROM system_station_artworks WHERE "heroVideoAssetId" IS NOT NULL AND "heroVideoAssetId" <> \'\''),
      recommendationDb.query('SELECT "playlistKey", "coverArtwork", "homeCardArtwork", "detailSquareVideoAssetId", "detailMobileVideoAssetId", "homeHeroVideoAssetId", "detailSquareVideo", "detailMobileVideo", "homeHeroVideo" FROM system_playlist_artworks WHERE "detailSquareVideoAssetId" <> \'\' AND "detailMobileVideoAssetId" <> \'\' AND "homeHeroVideoAssetId" <> \'\''),
    ]);
    const ids = [...new Set([
      ...stations.rows.map((row) => row.heroVideoAssetId),
      ...playlists.rows.flatMap((row) => [row.detailSquareVideoAssetId, row.detailMobileVideoAssetId, row.homeHeroVideoAssetId]),
    ])];
    const assets = ids.length ? await assetDb.query(
      'SELECT id, status, kind, purpose, "publicUrl" AS public_url, width, height, "durationMillis" AS duration_millis, variants FROM assets WHERE id = ANY($1::text[])',
      [ids],
    ) : { rows: [] };
    const byId = new Map(assets.rows.map((asset) => [asset.id, asset]));
    const changes = [];
    for (const row of stations.rows) {
      const video = refreshedVideo(byId.get(row.heroVideoAssetId) ?? { id: row.heroVideoAssetId });
      if (string(object(row.heroVideo).video) !== video.video) changes.push({ type: 'station', key: row.stationKey, video });
    }
    for (const row of playlists.rows) {
      const square = refreshedVideo(byId.get(row.detailSquareVideoAssetId) ?? { id: row.detailSquareVideoAssetId });
      const mobile = refreshedVideo(byId.get(row.detailMobileVideoAssetId) ?? { id: row.detailMobileVideoAssetId });
      const hero = refreshedVideo(byId.get(row.homeHeroVideoAssetId) ?? { id: row.homeHeroVideoAssetId });
      const stale = string(object(row.detailSquareVideo).video) !== square.video ||
        string(object(row.detailMobileVideo).video) !== mobile.video ||
        string(object(row.homeHeroVideo).video) !== hero.video;
      if (stale) changes.push({ type: 'playlist', key: row.playlistKey, square, mobile, hero, row });
    }
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', stationChanges: changes.filter((x) => x.type === 'station').length, playlistChanges: changes.filter((x) => x.type === 'playlist').length, changedVideoSlots: changes.filter((x) => x.type === 'station').length + changes.filter((x) => x.type === 'playlist').length * 3, targets: changes.map(({ type, key }) => ({ type, key })) }, null, 2));
    if (!apply) return;
    await recommendationDb.query('BEGIN');
    try {
      for (const change of changes) {
        if (change.type === 'station') {
          await recommendationDb.query('UPDATE system_station_artworks SET "heroVideo" = $1::jsonb, "updatedAt" = NOW() WHERE "stationKey" = $2', [JSON.stringify(change.video), change.key]);
        } else {
          await recommendationDb.query('UPDATE system_playlist_artworks SET "coverArtwork" = $1::jsonb, "homeCardArtwork" = $2::jsonb, "detailSquareVideo" = $3::jsonb, "detailMobileVideo" = $4::jsonb, "homeHeroVideo" = $5::jsonb, "updatedAt" = NOW() WHERE "playlistKey" = $6', [JSON.stringify(posterArtwork(change.square, change.row.coverArtwork)), JSON.stringify(posterArtwork(change.hero, change.row.homeCardArtwork)), JSON.stringify(change.square), JSON.stringify(change.mobile), JSON.stringify(change.hero), change.key]);
        }
      }
      const stale = await recommendationDb.query("UPDATE recommendation_pages SET \"staleAfter\" = to_timestamp(0), \"updatedAt\" = NOW() WHERE name = 'listen-now' AND status = 'PUBLISHED'");
      // A published Home page can be regenerated without rebuilding the three
      // fixed system playlists when their selection cache remains fresh. Their
      // resource snapshots contain the card artwork/video consumed by Home, so
      // invalidate that cache as well after recovering video outputs.
      const playlistRefresh = await recommendationDb.query(
        'UPDATE system_playlist_refresh_states SET "refreshedAt" = to_timestamp(0), "updatedAt" = NOW() WHERE "playlistKey" = ANY($1::text[])',
        [['chill', 'new-music', 'get-up']],
      );
      await recommendationDb.query('COMMIT');
      console.log(`Updated ${changes.length} records, marked ${stale.rowCount} published Listen Now page(s) stale, and invalidated ${playlistRefresh.rowCount} fixed playlist refresh state(s).`);
    } catch (error) {
      await recommendationDb.query('ROLLBACK');
      throw error;
    }
  } finally {
    await Promise.all([assetDb.end(), recommendationDb.end()]);
  }
}

main().catch((error) => {
  console.error(`Video URL refresh failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

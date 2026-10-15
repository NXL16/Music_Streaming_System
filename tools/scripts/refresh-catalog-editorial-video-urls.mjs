#!/usr/bin/env node

/** Refreshes persisted album/artist/playlist editorial-video JSON after asset recovery. */
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
  const line = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).find((entry) => /^\s*DATABASE_URL\s*=/.test(entry));
  const value = line?.replace(/^\s*DATABASE_URL\s*=\s*/, '').trim().replace(/^(['"])(.*)\1$/, '$2');
  if (!value) throw new Error(`Missing DATABASE_URL in ${envPath}.`);
  return value;
}
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function string(value) { return typeof value === 'string' ? value : ''; }
function number(value) { return typeof value === 'number' ? value : 0; }

function editorialVideo(asset) {
  const variants = object(asset.variants);
  const poster = object(variants.poster);
  if (asset.status !== 'READY' || asset.kind !== 'VIDEO' || asset.purpose !== 'EDITORIAL_VIDEO' || !string(asset.public_url)) {
    throw new Error(`Asset ${asset.id} is not a READY editorial video.`);
  }
  const previewFrame = string(poster.url) && number(poster.width) > 0
    ? { assetId: asset.id, url: string(poster.url), width: number(poster.width), height: number(poster.height) }
    : undefined;
  return { primary: { assetId: asset.id, video: asset.public_url, durationMillis: number(asset.duration_millis), width: number(asset.width), height: number(asset.height), ...(previewFrame ? { previewFrame } : {}), variants } };
}

async function main() {
  const songDb = new Client({ connectionString: databaseUrl('song') });
  const recommendationDb = new Client({ connectionString: databaseUrl('recommendation') });
  const assetDb = new Client({ connectionString: databaseUrl('asset') });
  await Promise.all([songDb.connect(), recommendationDb.connect(), assetDb.connect()]);
  try {
    const refs = await songDb.query(`
      SELECT 'album' AS type, id, "editorialVideoAssetId" AS asset_id, "editorialVideo" AS video FROM albums WHERE "editorialVideoAssetId" <> ''
      UNION ALL SELECT 'artist', id, "editorialVideoAssetId", "editorialVideo" FROM artists WHERE "editorialVideoAssetId" <> ''
      UNION ALL SELECT 'playlist', id, "editorialVideoAssetId", "editorialVideo" FROM playlists WHERE "editorialVideoAssetId" <> ''
    `);
    const ids = [...new Set(refs.rows.map((row) => row.asset_id))];
    const assets = ids.length ? await assetDb.query('SELECT id, status, kind, purpose, "publicUrl" AS public_url, width, height, "durationMillis" AS duration_millis, variants FROM assets WHERE id = ANY($1::text[])', [ids]) : { rows: [] };
    const byId = new Map(assets.rows.map((asset) => [asset.id, asset]));
    const changes = refs.rows.flatMap((row) => {
      const asset = byId.get(row.asset_id);
      const current = asset ? editorialVideo(asset) : null;
      const stored = object(object(row.video).primary).video;
      return current && stored !== current.primary.video ? [{ ...row, current }] : [];
    });
    const byType = Object.fromEntries(['album', 'artist', 'playlist'].map((type) => [type, changes.filter((change) => change.type === type).length]));
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', changes: changes.length, byType, targets: changes.map(({ type, id, asset_id }) => ({ type, id, assetId: asset_id })) }, null, 2));
    if (!apply) return;
    await songDb.query('BEGIN');
    try {
      for (const change of changes) {
        const table = change.type === 'album' ? 'albums' : change.type === 'artist' ? 'artists' : 'playlists';
        await songDb.query(`UPDATE ${table} SET "editorialVideo" = $1::jsonb, "updatedAt" = NOW() WHERE id = $2`, [JSON.stringify(change.current), change.id]);
      }
      await songDb.query('COMMIT');
    } catch (error) { await songDb.query('ROLLBACK'); throw error; }
    await recommendationDb.query('BEGIN');
    try {
      for (const change of changes) {
        await recommendationDb.query('UPDATE recommendation_resource_snapshots SET "editorialVideo" = $1::jsonb, "updatedAt" = NOW() WHERE "resourceType" = $2 AND "resourceId" = $3', [JSON.stringify(change.current), `${change.type}s`, change.id]);
      }
      const stale = await recommendationDb.query("UPDATE recommendation_pages SET \"staleAfter\" = to_timestamp(0), \"updatedAt\" = NOW() WHERE name = 'listen-now' AND status = 'PUBLISHED'");
      await recommendationDb.query('COMMIT');
      console.log(`Updated ${changes.length} catalog records, refreshed matching recommendation snapshots, and marked ${stale.rowCount} Home page(s) stale.`);
    } catch (error) { await recommendationDb.query('ROLLBACK'); throw error; }
  } finally { await Promise.all([songDb.end(), recommendationDb.end(), assetDb.end()]); }
}
main().catch((error) => { console.error(`Catalog editorial video refresh failed: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });

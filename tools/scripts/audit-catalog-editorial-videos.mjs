#!/usr/bin/env node

/** Read-only audit of persisted artist/album/playlist editorial-video metadata. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const requireFromRoot = createRequire(path.join(root, 'package.json'));
const { Client } = requireFromRoot('pg');

function databaseUrl(app) {
  const envPath = path.join(root, `apps/${app}/.env`);
  const line = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).find((entry) => /^\s*DATABASE_URL\s*=/.test(entry));
  const value = line?.replace(/^\s*DATABASE_URL\s*=\s*/, '').trim().replace(/^(['"])(.*)\1$/, '$2');
  if (!value) throw new Error(`Missing DATABASE_URL in ${envPath}.`);
  return value;
}

async function main() {
  const songDb = new Client({ connectionString: databaseUrl('song') });
  const assetDb = new Client({ connectionString: databaseUrl('asset') });
  await Promise.all([songDb.connect(), assetDb.connect()]);
  try {
    const refs = await songDb.query(`
      SELECT 'album' AS type, id, "editorialVideoAssetId" AS asset_id, "editorialVideo" AS video FROM albums WHERE "editorialVideoAssetId" <> ''
      UNION ALL SELECT 'artist', id, "editorialVideoAssetId", "editorialVideo" FROM artists WHERE "editorialVideoAssetId" <> ''
      UNION ALL SELECT 'playlist', id, "editorialVideoAssetId", "editorialVideo" FROM playlists WHERE "editorialVideoAssetId" <> ''
    `);
    const ids = [...new Set(refs.rows.map((row) => row.asset_id))];
    const assets = ids.length ? await assetDb.query(
      'SELECT id, status, kind, purpose, "publicUrl" AS public_url, variants FROM assets WHERE id = ANY($1::text[])', [ids],
    ) : { rows: [] };
    const byId = new Map(assets.rows.map((asset) => [asset.id, asset]));
    const stale = refs.rows.flatMap((row) => {
      const asset = byId.get(row.asset_id);
      const stored = row.video && typeof row.video === 'object' && row.video.primary && typeof row.video.primary === 'object'
        ? String(row.video.primary.video ?? '') : '';
      return asset?.status === 'READY' && asset.public_url && stored !== asset.public_url
        ? [{ type: row.type, id: row.id, assetId: row.asset_id, storedUrl: stored, currentUrl: asset.public_url }]
        : [];
    });
    const issues = refs.rows.flatMap((row) => {
      const asset = byId.get(row.asset_id);
      if (!asset) return [{ type: row.type, id: row.id, assetId: row.asset_id, issue: 'ASSET_MISSING' }];
      if (asset.status !== 'READY') return [{ type: row.type, id: row.id, assetId: row.asset_id, issue: `ASSET_${asset.status}` }];
      return [];
    });
    console.log(JSON.stringify({ references: refs.rows.length, byType: Object.fromEntries(['album', 'artist', 'playlist'].map((type) => [type, refs.rows.filter((row) => row.type === type).length])), staleUrlCount: stale.length, stale, issueCount: issues.length, issues }, null, 2));
    if (stale.length || issues.length) process.exitCode = 1;
  } finally {
    await Promise.all([songDb.end(), assetDb.end()]);
  }
}
main().catch((error) => { console.error(`Catalog editorial video audit failed: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });

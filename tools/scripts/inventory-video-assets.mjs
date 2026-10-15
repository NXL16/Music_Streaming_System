#!/usr/bin/env node

/** Read-only video inventory for reconciling Asset DB against catalog references. */
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
  const assetDb = new Client({ connectionString: databaseUrl('asset') });
  const songDb = new Client({ connectionString: databaseUrl('song') });
  await Promise.all([assetDb.connect(), songDb.connect()]);
  try {
    const [assets, catalogRefs] = await Promise.all([
      assetDb.query('SELECT purpose, status, COUNT(*)::int AS count FROM assets WHERE kind = \'VIDEO\' GROUP BY purpose, status ORDER BY purpose, status'),
      songDb.query(`
        SELECT 'album' AS type, "editorialVideoAssetId" AS asset_id FROM albums WHERE "editorialVideoAssetId" <> ''
        UNION ALL SELECT 'artist', "editorialVideoAssetId" FROM artists WHERE "editorialVideoAssetId" <> ''
        UNION ALL SELECT 'playlist', "editorialVideoAssetId" FROM playlists WHERE "editorialVideoAssetId" <> ''
      `),
    ]);
    const byPurpose = {};
    for (const row of assets.rows) {
      byPurpose[row.purpose] ??= { total: 0, byStatus: {} };
      byPurpose[row.purpose].total += row.count;
      byPurpose[row.purpose].byStatus[row.status] = row.count;
    }
    const catalogByType = Object.fromEntries(['album', 'artist', 'playlist'].map((type) => [type, catalogRefs.rows.filter((row) => row.type === type).length]));
    console.log(JSON.stringify({ totalVideoAssets: assets.rows.reduce((sum, row) => sum + row.count, 0), byPurpose, catalogEditorialVideoReferences: { totalReferences: catalogRefs.rows.length, uniqueVideoAssets: new Set(catalogRefs.rows.map((row) => row.asset_id)).size, byType: catalogByType } }, null, 2));
  } finally { await Promise.all([assetDb.end(), songDb.end()]); }
}
main().catch((error) => { console.error(`Video inventory failed: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });

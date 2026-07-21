import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const apiBase = (process.env.MUSICAL_API_URL || 'http://localhost:9999/api/v1').replace(/\/$/, '');
const token = process.env.ADMIN_ACCESS_TOKEN?.trim();
if (!token) {
  throw new Error('ADMIN_ACCESS_TOKEN is required (it is used only for this process).');
}

const sourceDirectory = process.env.STATION_ARTWORK_DIRECTORY || 'apps/web/public/station';
const artwork = [
  ['focus', 'Focus.jpg'],
  ['feeling-blue', 'Feeling_Blue.jpg'],
  ['energy', 'enegry.jpg'],
  ['heartbreak', 'Heartbreak.jpg'],
  ['relax', 'Relax.jpg'],
  ['feel-good', 'Feel_Good.jpg'],
  ['love', 'Love.jpg'],
];

const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, { headers, ...options });
  const text = await response.text();
  const body = text ? (() => {
    try { return JSON.parse(text); } catch { return text; }
  })() : {};
  if (!response.ok) {
    throw new Error(
      `${options.method || 'GET'} ${path} failed (${response.status}): ${JSON.stringify(body)}`,
    );
  }
  return body;
}

async function waitUntilReady(assetId) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await request(`/admin/assets/${encodeURIComponent(assetId)}`);
    const asset = response.asset ?? response;
    if (asset.status === 'READY' || asset.status === 3) return asset;
    if (asset.status === 'FAILED' || asset.status === 4) {
      throw new Error(`Asset ${assetId} processing failed: ${asset.errorMessage || ''}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Asset ${assetId} was not READY after 60 seconds.`);
}

for (const [stationKey, fileName] of artwork) {
  const file = await readFile(join(sourceDirectory, fileName));
  const checksum = createHash('sha256').update(file).digest('hex');
  const requested = await request('/admin/assets/uploads', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'IMAGE',
      purpose: 'ARTWORK',
      filename: basename(fileName),
      contentType: 'image/jpeg',
      checksum,
      sizeBytes: file.length,
    }),
  });
  const asset = requested.asset;
  if (!asset?.id) throw new Error(`Asset service did not return an asset for ${fileName}.`);

  if (requested.uploadUrl) {
    const upload = await fetch(requested.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: file,
    });
    if (!upload.ok) throw new Error(`R2 upload failed for ${fileName}: ${upload.status}`);
  }

  await request(`/admin/assets/${encodeURIComponent(asset.id)}/finalize`, { method: 'POST' });
  await waitUntilReady(asset.id);
  await request(`/admin/recommendations/station-artwork/${encodeURIComponent(stationKey)}`, {
    method: 'PUT',
    body: JSON.stringify({ assetId: asset.id }),
  });
  console.log(`[station-artwork] bound ${stationKey} -> ${asset.id}`);
}

await request('/admin/recommendations/home/generate', {
  method: 'POST',
  body: JSON.stringify({
    scope: 'GLOBAL',
    name: 'listen-now',
    locale: 'en-GB',
    timezone: '+07:00',
    platform: 'web',
  }),
});
console.log('[station-artwork] regenerated global Home with processed artwork.');

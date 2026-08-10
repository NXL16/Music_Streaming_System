/** Uploads and binds the single Favourite Songs artwork, following Station's flow. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const apiBase = (process.env.MUSICAL_API_URL || 'http://localhost:9999/v1').replace(/\/$/, '');
const token = process.env.ADMIN_ACCESS_TOKEN?.trim();
if (!token) throw new Error('ADMIN_ACCESS_TOKEN is required.');
const source = process.env.FAVORITE_ARTWORK_FILE || 'apps/web/public/favourite/favorite.jpg';
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const request = async (path, options = {}) => {F
  const response = await fetch(`${apiBase}${path}`, { headers, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path} failed (${response.status}): ${JSON.stringify(body)}`);
  return body;
};
const file = await readFile(source);
const requested = await request('/admin/assets/uploads', { method: 'POST', body: JSON.stringify({ kind: 'IMAGE', purpose: 'ARTWORK', filename: basename(source), contentType: 'image/jpeg', checksum: createHash('sha256').update(file).digest('hex'), sizeBytes: file.length }) });
const asset = requested.asset;
if (!asset?.id) throw new Error('Asset service did not return an asset.');
if (requested.uploadUrl) {
  const upload = await fetch(requested.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: file });
  if (!upload.ok) throw new Error(`R2 upload failed: ${upload.status}`);
}
await request(`/admin/assets/${encodeURIComponent(asset.id)}/finalize`, { method: 'POST' });
for (let i = 0; i < 60; i++) {
  const result = await request(`/admin/assets/${encodeURIComponent(asset.id)}`);
  const current = result.asset ?? result;
  if (current.status === 'READY' || current.status === 3) break;
  if (current.status === 'FAILED' || current.status === 4) throw new Error('Asset processing failed.');
  await new Promise((resolve) => setTimeout(resolve, 1000));
  if (i === 59) throw new Error('Asset was not READY after 60 seconds.');
}
await request('/admin/songs/favorite-artwork', { method: 'PUT', body: JSON.stringify({ assetId: asset.id }) });
console.log(`[favorite-artwork] bound favorite -> ${asset.id}`);

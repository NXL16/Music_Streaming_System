import { createServer } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const config = loadEnv(join(here, '.env'));
const workerConfig = loadEnv(join(root, 'apps', 'worker', '.env'));
const baseUrl = (config.BASE_URL || 'http://localhost:9999/v1').replace(/\/+$/, '');
const port = Number(config.PORT || 4311);
const finalizerInternalToken = config.FINALIZER_INTERNAL_TOKEN || '';
const seedArtistPassword = config.SEED_ARTIST_PASSWORD || process.env.SEED_ARTIST_PASSWORD || '';
const runtimeDir = join(here, '.tmp');
const historyPath = join(runtimeDir, 'job-history.json');
const deviceIdentityPath = join(runtimeDir, 'device.json');
const localRefreshCookieName = 'seed_studio_refresh';
const refreshSessionMaxAgeSeconds = 7 * 24 * 60 * 60;
const seedDeviceTrustMaxAgeMs = 30 * 24 * 60 * 60 * 1000;
const appleMusicHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};
const appleMotionCache = new Map();
const systemMediaUploads = new Map();
const musicVideoPublishes = new Map();
const EDITORIAL_VIDEO_TYPES = new Set([
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska',
]);
const ARTWORK_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const auth = { accessToken: '', refreshToken: '', expiresAt: 0, challengeId: '' };
let refreshInFlight = null;
const job = {
  child: null,
  starting: false,
  secret: '',
  clients: new Set(),
  activities: [],
  outputBuffers: { stdout: '', stderr: '' },
  cancelRequested: false,
  current: null,
  history: readHistory(),
};
const artworkThemeRefresh = { running: false };
const MAX_JSON_BODY_BYTES = 25 * 1024 * 1024;
const MAX_ARTWORK_IMAGE_FILE_BYTES = 8 * 1024 * 1024;
const MAX_MUSIC_VIDEO_FILE_BYTES = 500 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const assetReadyWaitTimeoutMs = positiveConfigInteger(
  config.SEED_ASSET_READY_WAIT_TIMEOUT_MS,
  30 * 60 * 1_000,
);
const assetReadyWaitPollMs = positiveConfigInteger(
  config.SEED_ASSET_READY_WAIT_POLL_MS,
  3_000,
);
const mediaTransferTimeoutMs = positiveConfigInteger(
  config.SEED_MEDIA_TRANSFER_TIMEOUT_MS,
  60 * 60 * 1_000,
);

class RequestError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function positiveConfigInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeArtistName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    // Preserve CJK and other Unicode letters so the release picker uses the
    // same matching semantics as the seed process.
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function collectionIncludesArtist(collectionArtistName, selectedArtistName) {
  const selected = normalizeArtistName(selectedArtistName);
  if (!selected) return false;
  return String(collectionArtistName || '')
    .split(/\s*(?:,|&|feat\.?|ft\.?|featuring|x|với|and)\s+/i)
    .some((name) => {
      const candidate = normalizeArtistName(name);
      if (candidate === selected || candidate.includes(selected)) return true;
      const selectedTokens = new Set(selected.split(' '));
      const candidateTokens = candidate.split(' ').filter(Boolean);
      // Allow the common source alias "MCK" for the selected "RPT MCK",
      // while still requiring every meaningful candidate token to match.
      return candidateTokens.length > 0 && candidateTokens.every(
        (token) => token.length >= 3 && selectedTokens.has(token),
      );
    });
}

function parseAppleMusicServerData(html) {
  const match = html.match(/<script[^>]*id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/);
  return match ? JSON.parse(match[1].trim()) : null;
}

function appleMusicResourceId(value) {
  return String(value?.contentDescriptor?.identifiers?.storeAdamID || '');
}

function findAppleMusicResourceHeader(value, kind, resourceId, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);

  if (
    value.contentDescriptor?.kind === kind
    && appleMusicResourceId(value) === String(resourceId)
    && (value.videoArtwork || value.wideVideoArtwork || value.tallVideoArtwork || value.artwork)
  ) {
    return value;
  }

  for (const child of Object.values(value)) {
    const found = findAppleMusicResourceHeader(child, kind, resourceId, seen);
    if (found) return found;
  }
  return null;
}

function hasAppleMotionArtwork(dictionary) {
  return Object.values(dictionary || {}).some(
    (motion) => typeof motion?.video === 'string' && motion.video.startsWith('https://'),
  );
}

function appleMotionPresentation(header) {
  if (hasAppleMotionArtwork(header?.wideVideoArtwork?.dictionary)) return '16:9';
  if (hasAppleMotionArtwork(header?.videoArtwork?.dictionary)) return '1:1';
  if (hasAppleMotionArtwork(header?.tallVideoArtwork?.dictionary)) return 'dọc';
  return '';
}

async function appleMotionArtwork(kind, resourceId) {
  const cacheKey = `${kind}:${resourceId}`;
  if (appleMotionCache.has(cacheKey)) return appleMotionCache.get(cacheKey);

  const result = (async () => {
    try {
      const response = await fetch(
        `https://music.apple.com/vn/${kind}/_/${encodeURIComponent(resourceId)}`,
        { headers: appleMusicHeaders },
      );
      if (!response.ok) return '';
      const header = findAppleMusicResourceHeader(
        parseAppleMusicServerData(await response.text()),
        kind,
        resourceId,
      );
      return appleMotionPresentation(header);
    } catch {
      return '';
    }
  })();
  appleMotionCache.set(cacheKey, result);
  return result;
}

function jobIsRunning() {
  return Boolean(job.child || job.starting);
}

function validJobSecret(req) {
  const provided = Buffer.from(req.headers['x-seed-job-secret'] || '');
  const expected = Buffer.from(job.secret);
  return Boolean(
    job.child && expected.length > 0 && provided.length === expected.length
    && timingSafeEqual(provided, expected),
  );
}

function readHistory() {
  try {
    const parsed = JSON.parse(readFileSync(historyPath, 'utf8'));
    return Array.isArray(parsed) ? parsed.slice(0, 12) : [];
  } catch {
    return [];
  }
}

function saveHistory() {
  mkdirSync(runtimeDir, { recursive: true });
  const temporaryPath = `${historyPath}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(job.history, null, 2));
  renameSync(temporaryPath, historyPath);
}

function currentDeviceId() {
  try {
    const saved = JSON.parse(readFileSync(deviceIdentityPath, 'utf8'));
    const isValidId = typeof saved.id === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(saved.id);
    const isWithinTrustWindow = Number.isFinite(saved.createdAt)
      && Date.now() - saved.createdAt < seedDeviceTrustMaxAgeMs;
    if (isValidId && isWithinTrustWindow) {
      return saved.id;
    }
  } catch {
    // The first run has no device identity yet.
  }

  mkdirSync(runtimeDir, { recursive: true });
  const device = { id: randomUUID(), createdAt: Date.now() };
  const temporaryPath = `${deviceIdentityPath}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(device));
  renameSync(temporaryPath, deviceIdentityPath);
  return device.id;
}

function progressSnapshot() {
  const current = job.current;
  if (!current) return null;
  const songs = Object.values(current.songs);
  const count = (status) => songs.filter((song) => song.status === status).length;
  return {
    id: current.id,
    startedAt: current.startedAt,
    finishedAt: current.finishedAt || null,
    outcome: current.outcome || 'running',
    stopRequested: current.stopRequested,
    expectedSongs: current.expectedSongs,
    activeTitle: current.activeTitle || '',
    ready: count('ready'),
    failed: count('failed'),
    skipped: count('skipped'),
    processed: count('ready') + count('failed') + count('skipped'),
    songs: songs.slice(-80),
    options: current.options,
  };
}

function publishProgress() {
  publish('progress', progressSnapshot());
}

function updateSong(title, status, detail = '', songId = '', progressKey = '') {
  const current = job.current;
  if (!current || !title) return;
  const key = progressKey || title.trim().toLocaleLowerCase('vi');
  const previous = current.songs[key] || { title: title.trim(), status: 'queued' };
  current.songs[key] = {
    ...previous,
    title: title.trim(),
    status,
    detail: detail || previous.detail || '',
    ...(songId ? { songId } : {}),
    updatedAt: new Date().toISOString(),
  };
  current.activeTitle = ['uploading', 'processing'].includes(status) ? title.trim() : '';
  publishProgress();
}

function trackProgressLine(line) {
  const upload = line.match(/uploading song\s+"(.+?)"/i);
  if (upload) return updateSong(upload[1], 'uploading');
  const processing = line.match(/waiting for song\s+"(.+?)"/i);
  if (processing) return updateSong(processing[1], 'processing');
  const ready = line.match(/song\s+"(.+?)"\s+ready\s+—\s+songId:\s*([a-f0-9-]+)/i);
  if (ready) return updateSong(ready[1], 'ready', '', ready[2]);
  const failed = line.match(/failed to upload\s+"(.+?)"\s*:\s*(.+)$/i);
  if (failed) return updateSong(failed[1], 'failed', failed[2]);
  const skipped = line.match(/skipping\s+"(.+?)"\s*:\s*(.+)$/i);
  if (skipped) return updateSong(skipped[1], 'skipped', skipped[2]);
}

function loadEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.trimStart().startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=');
        return separator > 0 ? [line.slice(0, separator).trim(), line.slice(separator + 1).trim()] : null;
      })
      .filter(Boolean),
  );
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function requestCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || '')
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const separator = item.indexOf('=');
        return separator === -1
          ? [item, '']
          : [item.slice(0, separator), decodeURIComponent(item.slice(separator + 1))];
      }),
  );
}

function localRefreshCookie(refreshToken) {
  return `${localRefreshCookieName}=${encodeURIComponent(refreshToken)}; Max-Age=${refreshSessionMaxAgeSeconds}; Path=/; HttpOnly; SameSite=Strict`;
}

function expiredLocalRefreshCookie() {
  return `${localRefreshCookieName}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict`;
}

function clearAuthSession() {
  auth.accessToken = '';
  auth.refreshToken = '';
  auth.expiresAt = 0;
  auth.challengeId = '';
}

function pruneExpiredSystemMediaUploads() {
  const now = Date.now();
  for (const [assetId, upload] of systemMediaUploads) {
    if (upload.expiresAt <= now) systemMediaUploads.delete(assetId);
  }
}

async function prepareSystemMediaUpload({
  kind,
  purpose,
  filename,
  contentType,
  checksum,
  sizeBytes,
  posterTimestampMillis = 0,
  allowedContentTypes,
  maxBytes,
  label,
}) {
  if (!allowedContentTypes.has(contentType)) {
    throw new RequestError(400, `${label} has an unsupported file type`);
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxBytes) {
    throw new RequestError(400, `${label} must be between 1 byte and ${Math.floor(maxBytes / 1024 / 1024)} MB`);
  }
  const requested = await fetch(`${baseUrl}/admin/assets/uploads`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, purpose, filename, contentType, checksum, sizeBytes, posterTimestampMillis }),
  });
  const payload = await requested.json().catch(() => ({}));
  if (!requested.ok || !payload.asset?.id) {
    throw new RequestError(requested.status, payload.message || `Could not prepare ${label.toLowerCase()} upload`);
  }
  if (!payload.instant && !payload.uploadUrl) {
    throw new RequestError(502, 'Storage did not return an upload URL');
  }
  if (payload.uploadUrl) {
    pruneExpiredSystemMediaUploads();
    systemMediaUploads.set(payload.asset.id, {
      uploadUrl: payload.uploadUrl,
      contentType,
      maxBytes,
      expiresAt: Date.now() + mediaTransferTimeoutMs,
    });
  }
  return { assetId: payload.asset.id, instant: Boolean(payload.instant) };
}

async function transferSystemMediaUpload(req, assetId, label) {
  const prepared = systemMediaUploads.get(assetId);
  if (!prepared || prepared.expiresAt <= Date.now()) {
    systemMediaUploads.delete(assetId);
    throw new RequestError(400, `${label} upload session has expired; choose the file again`);
  }
  const contentType = String(req.headers['content-type'] || '');
  const contentLength = Number(req.headers['content-length'] || 0);
  if (contentType !== prepared.contentType || !Number.isFinite(contentLength) || contentLength <= 0 || contentLength > prepared.maxBytes) {
    throw new RequestError(400, `${label} upload metadata does not match`);
  }
  const uploaded = await fetch(prepared.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'Content-Length': String(contentLength) },
    body: limitedRequestBody(req, prepared.maxBytes),
    duplex: 'half',
  });
  systemMediaUploads.delete(assetId);
  if (!uploaded.ok) throw new RequestError(502, `Could not upload ${label.toLowerCase()} to storage`);
}

async function finalizeSystemMediaAssets(assetIds, label) {
  const token = await accessToken();
  for (const assetId of assetIds) {
    const finalized = await fetch(`${baseUrl}/admin/assets/${encodeURIComponent(assetId)}/finalize`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
    if (!finalized.ok) throw new RequestError(finalized.status, `Could not finalize ${label.toLowerCase()}`);
    const deadline = Date.now() + assetReadyWaitTimeoutMs;
    let isReady = false;
    while (Date.now() < deadline) {
      const remainingMs = deadline - Date.now();
      await new Promise((resolve) => setTimeout(resolve, Math.min(assetReadyWaitPollMs, remainingMs)));
      const current = await fetch(`${baseUrl}/admin/assets/${encodeURIComponent(assetId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const assetPayload = await current.json().catch(() => ({}));
      const asset = assetPayload.asset ?? assetPayload;
      if (asset?.status === 'READY' || asset?.status === 3) {
        isReady = true;
        break;
      }
      if (asset?.status === 'FAILED' || asset?.status === 4) {
        throw new RequestError(422, `${label} processing failed`);
      }
    }
    if (!isReady) {
      throw new RequestError(504, `${label} processing timed out after ${Math.ceil(assetReadyWaitTimeoutMs / 60_000)} minutes`);
    }
  }
  return token;
}

function pruneExpiredMusicVideoPublishes() {
  const now = Date.now();
  for (const [assetId, job] of musicVideoPublishes) {
    if (job.expiresAt <= now) musicVideoPublishes.delete(assetId);
  }
}

async function resumeMusicVideoPublish(songId, assetId) {
  pruneExpiredMusicVideoPublishes();
  const existing = musicVideoPublishes.get(assetId);
  if (existing?.songId === songId) return existing;
  if (existing) throw new RequestError(409, 'This video asset is already assigned to another song');

  const token = await accessToken();
  const songResponse = await fetch(`${baseUrl}/songs/private/${encodeURIComponent(songId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const songPayload = await songResponse.json().catch(() => ({}));
  if (!songResponse.ok || !songPayload.song) {
    throw new RequestError(songResponse.status, songPayload.message || 'Song not found or inaccessible');
  }
  const assetResponse = await fetch(`${baseUrl}/admin/assets/${encodeURIComponent(assetId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const assetPayload = await assetResponse.json().catch(() => ({}));
  if (!assetResponse.ok || !(assetPayload.asset ?? assetPayload)?.id) {
    throw new RequestError(assetResponse.status, assetPayload.message || 'Video asset was not found');
  }
  const job = {
    songId,
    status: 'PROCESSING',
    error: '',
    draftId: '',
    expiresAt: Date.now() + assetReadyWaitTimeoutMs + 5 * 60 * 1_000,
  };
  musicVideoPublishes.set(assetId, job);
  return job;
}

async function publishMusicVideo(songId, assetId, token) {
  const drafted = await fetch(`${baseUrl}/admin/catalog/song-videos/draft`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ storefront: 'vn', songId, videoAssetId: assetId, kind: 'official' }),
  });
  const draft = await drafted.json().catch(() => ({}));
  if (!drafted.ok || !draft.id) throw new RequestError(drafted.status, draft.message || 'Could not create music video draft');
  const submitted = await fetch(`${baseUrl}/admin/catalog/drafts/${encodeURIComponent(draft.id)}/submit`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  });
  if (!submitted.ok) {
    const payload = await submitted.json().catch(() => ({}));
    throw new RequestError(submitted.status, payload.message || 'Could not submit music video draft');
  }
  const published = await fetch(`${baseUrl}/admin/catalog/drafts/${encodeURIComponent(draft.id)}/publish`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  });
  if (!published.ok) {
    const payload = await published.json().catch(() => ({}));
    throw new RequestError(published.status, payload.message || 'Could not publish music video');
  }
  return draft.id;
}

async function publishedMusicVideoId(songId, assetId, token) {
  const response = await fetch(
    `${baseUrl}/catalog/vn/songs/${encodeURIComponent(songId)}/videos`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) return '';
  const payload = await response.json().catch(() => ({}));
  const video = Array.isArray(payload.videos)
    ? payload.videos.find((item) => item?.videoAssetId === assetId)
    : null;
  return typeof video?.id === 'string' ? video.id : '';
}

async function regenerateGlobalHome(token) {
  const response = await fetch(`${baseUrl}/admin/recommendations/home/generate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scope: 'GLOBAL',
      name: 'listen-now',
      locale: 'en-GB',
      timezone: '+07:00',
      platform: 'web',
    }),
  });
  if (response.ok) return;

  const payload = await response.json().catch(() => ({}));
  throw new RequestError(
    response.status,
    payload.message || payload.error || 'Could not regenerate Home after updating playlist media',
  );
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON_BODY_BYTES) {
      throw new RequestError(413, 'Request body too large');
    }
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

async function* limitedRequestBody(req, maxBytes) {
  let received = 0;
  for await (const chunk of req) {
    received += chunk.length;
    if (received > maxBytes) throw new RequestError(413, 'Media exceeds the permitted file size');
    yield chunk;
  }
}

function responseData(payload) {
  return payload?.data && typeof payload.data === 'object' ? payload.data : payload;
}

function refreshFromHeaders(headers) {
  const cookies = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : [headers.get('set-cookie') || ''];
  const cookie = cookies.find((value) => value.startsWith('refresh_token='));
  if (cookie) auth.refreshToken = cookie.split(';', 1)[0].slice('refresh_token='.length);
}

function acceptSession(response, payload) {
  refreshFromHeaders(response.headers);
  const data = responseData(payload);
  if (!data?.accessToken || !auth.refreshToken) throw new Error('API did not issue a refresh session');
  auth.accessToken = data.accessToken;
  // The API owns the lifetime of its JWT. Do not guess a fixed duration here:
  // a long seed can otherwise keep serving a token that has already expired.
  const [, payloadSegment] = data.accessToken.split('.');
  try {
    const jwtPayload = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8'));
    const expiration = Number(jwtPayload?.exp) * 1000;
    // Refresh one minute early so the token cannot expire mid-request.
    auth.expiresAt = Number.isFinite(expiration)
      ? Math.max(Date.now(), expiration - 60_000)
      : Date.now();
  } catch {
    // An unparseable token is never cached; the next request refreshes it.
    auth.expiresAt = Date.now();
  }
  auth.challengeId = '';
}

async function apiAuth(path, body, cookie = '') {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new RequestError(
      response.status,
      payload?.message || `API ${response.status}`,
    );
  }
  return { response, payload };
}

async function accessToken({ forceRefresh = false } = {}) {
  if (!forceRefresh && auth.accessToken && Date.now() < auth.expiresAt) return auth.accessToken;
  if (!auth.refreshToken) throw new Error('Seed Studio is not authenticated');

  // The browser status poll and the seed child can reach this point together.
  // Refresh tokens rotate on use, so two independent refresh requests would
  // make the loser receive 401 and incorrectly log the local user out.
  if (refreshInFlight) return refreshInFlight;

  const refreshToken = auth.refreshToken;
  const refresh = (async () => {
    const { response, payload } = await apiAuth(
      '/auth/refresh',
      {},
      `refresh_token=${refreshToken}`,
    );
    acceptSession(response, payload);
    return auth.accessToken;
  })();
  refreshInFlight = refresh;
  try {
    return await refresh;
  } finally {
    if (refreshInFlight === refresh) refreshInFlight = null;
  }
}

async function restoreSession(req) {
  const refreshToken = requestCookies(req)[localRefreshCookieName];
  if (!refreshToken) return { authenticated: Boolean(auth.refreshToken) };

  const hasCurrentSession = Boolean(auth.accessToken) && Date.now() < auth.expiresAt;
  if (refreshToken !== auth.refreshToken && !hasCurrentSession && !refreshInFlight) {
    auth.accessToken = '';
    auth.refreshToken = refreshToken;
    auth.expiresAt = 0;
  }

  try {
    await accessToken();
    return { authenticated: true, cookie: localRefreshCookie(auth.refreshToken) };
  } catch (error) {
    if (error instanceof RequestError && [401, 403].includes(error.statusCode)) {
      clearAuthSession();
      return { authenticated: false, cookie: expiredLocalRefreshCookie() };
    }
    return { authenticated: false, error };
  }
}

function publish(type, data) {
  const event = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of job.clients) client.write(event);
}

function stripAnsi(text) {
  return text.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
}

function publishActivity(kind, title, detail = '') {
  const activity = { at: new Date().toISOString(), kind, title, detail };
  job.activities.push(activity);
  if (job.activities.length > 24) job.activities.shift();
  publish('activity', activity);
}

function captureLine(stream, line) {
  if (!line) return;

  trackProgressLine(line);

  if (/audio mode:/i.test(line)) return publishActivity('info', 'Chế độ xử lý đã chọn', line.replace(/^.*audio mode:\s*/i, ''));
  if (/static lyric collection:/i.test(line)) {
    return publishActivity('info', 'Static lyric Apple Music', line.replace(/^.*static lyric collection:\s*/i, ''));
  }
  if (/phase 1|searching apple music/i.test(line)) return publishActivity('working', 'Đang tìm metadata nghệ sĩ');
  if (/downloading audio/i.test(line)) return publishActivity('working', 'Đang tải audio nguồn');
  if (/uploading song/i.test(line)) return publishActivity('working', 'Đang upload bài hát', line.replace(/^.*Uploading song\s*/i, ''));
  if (/calling finalize/i.test(line)) return publishActivity('working', 'Đang đưa bài vào hàng đợi xử lý');
  if (/waiting for song/i.test(line)) return publishActivity('working', 'Worker đang xử lý bài hát');
  if (/reading apple music static lyric/i.test(line)) {
    return publishActivity('working', 'Đang lấy static lyric từ Apple Music', line);
  }
  if (/waiting 5s for apple music song controls/i.test(line)) {
    return publishActivity('working', 'Đang chờ Apple Music tải trang bài hát', line);
  }
  if (/started apple music playback from the song page/i.test(line)) {
    return publishActivity('working', 'Đã bấm Play trên trang bài hát', line);
  }
  if (/waiting 3s for playback before opening/i.test(line)) {
    return publishActivity('working', 'Đang chờ player tải lyric', line);
  }
  if (/opened apple music player lyrics panel/i.test(line)) {
    return publishActivity('working', 'Đã mở sidebar lyric Apple Music', line);
  }
  if (/apple music player provided \d+ lyric line/i.test(line)) {
    return publishActivity('success', 'Đã lấy static lyric từ player', line);
  }
  if (/apple music has no static lyric|player lyrics control was not available|play control was not available/i.test(line)) {
    return publishActivity('info', 'Apple Music không có static lyric khả dụng', line);
  }
  if (/yt-dlp.*(?:HTTP Error 403|forbidden)/i.test(line)) {
    return publishActivity(
      'info',
      'Nguồn YouTube không phản hồi, đang thử nguồn kế tiếp',
    );
  }
  if (/^\[seed\]\s*⚠/i.test(line)) {
    return publishActivity(
      'info',
      'Cảnh báo, đang dùng fallback',
      line.replace(/^\[seed\]\s*⚠\s*/i, ''),
    );
  }
  if (stream === 'stderr' || /\b(error|failed|✗)\b/i.test(line)) return publishActivity('error', 'Job gặp lỗi', line);
  if (/\bready\b/i.test(line)) return publishActivity('success', 'Bài hát đã sẵn sàng', line);
}

function captureOutput(stream, text) {
  const output = stripAnsi(`${job.outputBuffers[stream] || ''}${text}`);
  const lines = output.split(/\r?\n/);
  job.outputBuffers[stream] = lines.pop() || '';
  for (const rawLine of lines) captureLine(stream, rawLine.trim());
}

function flushOutputBuffers() {
  for (const [stream, buffered] of Object.entries(job.outputBuffers)) {
    if (buffered.trim()) captureLine(stream, buffered.trim());
    job.outputBuffers[stream] = '';
  }
}

async function assertFinalizerReady() {
  let response;
  try {
    // A valid internal token reaches DTO validation and returns 400 because
    // the deliberately empty request has no song ID. It never changes state.
    response = await fetch(`${baseUrl}/songs/internal/finalize-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-token': finalizerInternalToken,
      },
      body: '{}',
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new Error(`Could not reach the API finalizer at ${baseUrl}`);
  }

  if (response.status === 400) return;
  if (response.status === 401 || response.status === 403) {
    throw new Error('FINALIZER_INTERNAL_TOKEN does not match the API configuration');
  }
  if (response.status === 404) {
    throw new Error('API finalizer route is unavailable; check BASE_URL and API version');
  }
  throw new Error(`API finalizer preflight failed with HTTP ${response.status}`);
}

async function apiHealth() {
  try {
    await assertFinalizerReady();
    return { status: 'ok', detail: 'API và token finalizer sẵn sàng' };
  } catch (error) {
    return { status: 'error', detail: error instanceof Error ? error.message : 'Không kiểm tra được API' };
  }
}

function modalHealthUrl() {
  const endpoint = workerConfig.STEM_SEPARATION_URL || '';
  return endpoint.replace(/-separate(?=\.modal\.run(?:\/|$))/, '-health');
}

async function modalHealth() {
  if (workerConfig.STEM_SEPARATION_ENABLED !== 'true') {
    return { status: 'skipped', detail: 'Tách stem chưa được bật trong Worker' };
  }
  const endpoint = modalHealthUrl();
  const secret = workerConfig.STEM_SEPARATION_SHARED_SECRET || '';
  if (!endpoint || !secret) {
    return { status: 'error', detail: 'Thiếu cấu hình Modal trong apps/worker/.env' };
  }
  try {
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(8_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.r2 !== 'ok') {
      return { status: 'error', detail: `Modal/R2 trả HTTP ${response.status}` };
    }
    return { status: 'ok', detail: 'Modal và R2 sẵn sàng' };
  } catch {
    return { status: 'error', detail: 'Không kết nối được Modal health endpoint' };
  }
}

async function healthSnapshot() {
  const [api, modal] = await Promise.all([apiHealth(), modalHealth()]);
  const workerConfigured = Boolean(workerConfig.REDIS_URL || workerConfig.REDIS_HOST)
    && Boolean(workerConfig.STEM_SEPARATION_URL || workerConfig.STEM_SEPARATION_ENABLED !== 'true');
  return {
    checkedAt: new Date().toISOString(),
    api,
    modal,
    artistAccount: seedArtistPassword
      ? { status: 'ok', detail: 'Mật khẩu tài khoản Artist seed đã được cấu hình.' }
      : { status: 'error', detail: 'Thiếu SEED_ARTIST_PASSWORD trong tools/seed-studio/.env.' },
    worker: workerConfigured
      ? { status: 'unknown', detail: 'Worker/Redis đã có cấu hình; chưa có health endpoint để probe trực tiếp.' }
      : { status: 'error', detail: 'Thiếu cấu hình Worker hoặc Redis.' },
  };
}

async function startJob(options) {
  if (jobIsRunning()) throw new Error('A seed job is already running');
  job.starting = true;

  try {
    if (!options.artistQuery?.trim()) throw new Error('Artist query is required');
    const metadataOnly = Boolean(options.metadataOnly);
    if (!options.dryRun && !finalizerInternalToken) {
      throw new Error(
        'FINALIZER_INTERNAL_TOKEN is missing in tools/seed-studio/.env',
      );
    }
    if (!options.dryRun && !metadataOnly && !seedArtistPassword) {
      throw new Error(
        'SEED_ARTIST_PASSWORD is missing in tools/seed-studio/.env',
      );
    }

    const args = [join(root, 'tools', 'scripts', 'seed-artist.mjs'), options.artistQuery.trim()];
    const audioMode = String(options.audioMode || 'STANDARD').toUpperCase();
    if (!options.artistId?.trim()) throw new Error('Select an artist first');
    if (!metadataOnly && (!Array.isArray(options.albumIds) || options.albumIds.length === 0)) {
      throw new Error('Select at least one album');
    }
    if (!['STANDARD', 'SING'].includes(audioMode)) {
      throw new Error('Audio mode must be STANDARD or SING');
    }
    args.push(
      '--artist-id',
      options.artistId.trim(),
      '--album-ids',
      (options.albumIds || []).join(','),
      '--audio-mode',
      audioMode,
    );
    if (options.catalogArtistId?.trim()) {
      args.push('--catalog-artist-id', options.catalogArtistId.trim());
    }
    if (metadataOnly) args.push('--metadata-only');
    if (options.dryRun) args.push('--dry-run');
    if (options.noYoutube) args.push('--no-youtube');
    if (options.noSoundcloud) args.push('--no-soundcloud');
    if (options.staticLyrics === false) args.push('--no-static-lyrics');
    if (!options.dryRun) await assertFinalizerReady();

    job.secret = randomUUID();
    job.cancelRequested = false;
    job.current = {
      id: randomUUID(),
      startedAt: new Date().toISOString(),
      options: {
        artistQuery: options.artistQuery.trim(),
        artistId: options.artistId.trim(),
        albumIds: options.albumIds,
        catalogArtistId: options.catalogArtistId?.trim() || '',
        metadataOnly,
        audioMode,
        dryRun: Boolean(options.dryRun),
        noYoutube: Boolean(options.noYoutube),
        noSoundcloud: Boolean(options.noSoundcloud),
        staticLyrics: options.staticLyrics !== false,
      },
      expectedSongs: Number.isSafeInteger(options.expectedSongs) && options.expectedSongs > 0
        ? options.expectedSongs
        : 0,
      activeTitle: '',
      stopRequested: false,
      songs: {},
    };
    job.activities = [];
    job.outputBuffers = { stdout: '', stderr: '' };
    publishActivity('working', 'Đang chuẩn bị job');
    publishProgress();
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: {
        ...process.env,
        BASE_URL: baseUrl,
        FINALIZER_INTERNAL_TOKEN: finalizerInternalToken,
        SEED_ARTIST_PASSWORD: seedArtistPassword,
        SEED_STUDIO_TOKEN_URL: `http://127.0.0.1:${port}/api/job-token`,
        SEED_STUDIO_JOB_SECRET: job.secret,
        ...(config.SEED_READY_WAIT_TIMEOUT_MS
          ? { SEED_READY_WAIT_TIMEOUT_MS: config.SEED_READY_WAIT_TIMEOUT_MS }
          : {}),
        ...(config.SEED_READY_WAIT_POLL_MS
          ? { SEED_READY_WAIT_POLL_MS: config.SEED_READY_WAIT_POLL_MS }
          : {}),
        ...(config.SEED_ASSET_READY_WAIT_TIMEOUT_MS
          ? {
            SEED_ASSET_READY_WAIT_TIMEOUT_MS:
              config.SEED_ASSET_READY_WAIT_TIMEOUT_MS,
          }
          : {}),
        ...(config.SEED_ASSET_READY_WAIT_POLL_MS
          ? {
            SEED_ASSET_READY_WAIT_POLL_MS:
              config.SEED_ASSET_READY_WAIT_POLL_MS,
          }
          : {}),
        ...(config.SEED_API_REQUEST_TIMEOUT_MS
          ? {
            SEED_API_REQUEST_TIMEOUT_MS:
              config.SEED_API_REQUEST_TIMEOUT_MS,
          }
          : {}),
      },
      // The dashboard passes every required selection as arguments. No terminal
      // input pipe is needed, which prevents the old CLI prompt path from
      // leaking into the visual workflow.
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    job.child = child;

    const finishJob = (kind, title, detail) => {
      if (job.child !== child) return;
      flushOutputBuffers();
      const outcome = job.cancelRequested ? 'cancelled' : kind === 'success' ? 'success' : 'failed';
      if (job.current) {
        job.current.finishedAt = new Date().toISOString();
        job.current.outcome = outcome;
        job.current.activeTitle = '';
        job.history.unshift(progressSnapshot());
        job.history = job.history.slice(0, 12);
        saveHistory();
      }
      publishActivity(kind, title, detail);
      job.child = null;
      job.starting = false;
      job.secret = '';
      publish('status', { running: false });
      publishProgress();
    };

    child.stdout.on('data', (chunk) =>
      captureOutput('stdout', chunk.toString()),
    );
    child.stderr.on('data', (chunk) =>
      captureOutput('stderr', chunk.toString()),
    );
    child.once('error', (error) =>
      finishJob('error', 'Không thể khởi chạy job', error.message),
    );
    child.once('exit', (code, signal) =>
      finishJob(
        job.cancelRequested ? 'info' : code === 0 && !signal ? 'success' : 'error',
        job.cancelRequested
          ? 'Job đã được dừng theo yêu cầu'
          : code === 0 && !signal
            ? 'Job đã hoàn tất'
            : 'Job kết thúc không thành công',
        job.cancelRequested ? 'Bạn có thể bấm tiếp tục để Seed Studio dùng lại state đã lưu.' : signal || `exit code ${code}`,
      ),
    );
    job.starting = false;
    publish('status', { running: true });
  } catch (error) {
    job.starting = false;
    throw error;
  }
}

function artworkThemeTarget(body) {
  const targetType = ['album', 'playlist', 'asset'].includes(body?.targetType)
    ? body.targetType
    : '';
  const targetId = String(body?.targetId || '').trim();
  const color = String(body?.color || '').trim();
  if (!targetType || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(targetId)) {
    throw new RequestError(400, 'Hãy chọn Album hoặc Asset và nhập UUID hợp lệ.');
  }
  if (color && !/^#?[0-9a-f]{6}$/i.test(color)) {
    throw new RequestError(400, 'Màu phải có dạng #RRGGBB.');
  }
  return { targetType, targetId, color: color ? `#${color.replace(/^#/, '')}` : '' };
}

function limitedOutput(value) {
  return value.trim().slice(-4_000);
}

async function refreshArtworkTheme({ targetType, targetId, color, dryRun }) {
  if (jobIsRunning()) {
    throw new RequestError(409, 'Hãy chờ job seed hiện tại hoàn tất trước khi làm mới màu artwork.');
  }
  if (artworkThemeRefresh.running) {
    throw new RequestError(409, 'Một lần phân tích màu artwork khác đang chạy.');
  }

  artworkThemeRefresh.running = true;
  try {
    const args = [
      'artwork:theme:refresh',
      '--',
      `--${targetType}`,
      targetId,
      ...(color ? ['--color', color] : []),
      ...(dryRun ? ['--dry-run'] : []),
    ];
    const output = await new Promise((resolve, reject) => {
      const bundledPnpmCli = join(
        dirname(process.execPath),
        'node_modules',
        'pnpm',
        'bin',
        'pnpm.cjs',
      );
      // On Windows, spawning pnpm.cmd from a Node HTTP process can fail with
      // EINVAL. Run its JavaScript entry point through the active Node binary
      // when available; retain the normal pnpm command for other setups.
      const child = existsSync(bundledPnpmCli)
        ? spawn(process.execPath, [bundledPnpmCli, ...args], {
          cwd: root,
          env: process.env,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        })
        : spawn('pnpm', args, {
          cwd: root,
          env: process.env,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout = (stdout + chunk).slice(-8_000); });
      child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-8_000); });
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        if (code === 0 && !signal) return resolve({ stdout, stderr });
        reject(new RequestError(422, limitedOutput(stderr || stdout) || `Lệnh kết thúc với mã ${code ?? signal ?? 'unknown'}.`));
      });
    });
    const outputText = `${output.stdout}\n${output.stderr}`;
    const resolvedColor = outputText.match(/^\[theme\] asset [^:]+: (#[0-9a-f]{6})$/im)?.[1] || '';
    const paletteMatch = outputText.match(/^\[theme\] palette (\{.+\})$/im);
    const previewUrl = outputText.match(/^\[theme\] preview (.+)$/im)?.[1]?.trim() || '';
    let palette = null;
    try {
      palette = paletteMatch ? JSON.parse(paletteMatch[1]) : null;
    } catch {
      // The color is still usable even if optional presentation data is absent.
    }
    const affectedMatch = outputText.match(/^\[theme\] affected (\{.+\})$/im);
    let affected = null;
    try {
      affected = affectedMatch ? JSON.parse(affectedMatch[1]) : null;
    } catch {
      // The command itself succeeded; output details are optional for the UI.
    }
    return { dryRun, targetType, targetId, color: resolvedColor, palette, previewUrl, affected, output: limitedOutput(outputText) };
  } finally {
    artworkThemeRefresh.running = false;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(readFileSync(join(here, 'public', 'index.html')));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      job.clients.add(res);
      for (const activity of job.activities) res.write(`event: activity\ndata: ${JSON.stringify(activity)}\n\n`);
      res.write(`event: status\ndata: ${JSON.stringify({ running: jobIsRunning() })}\n\n`);
      res.write(`event: progress\ndata: ${JSON.stringify(progressSnapshot())}\n\n`);
      req.on('close', () => job.clients.delete(res));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/status') {
      const session = await restoreSession(req);
      return sendJson(res, 200, {
        authenticated: session.authenticated,
        requiresTwoFactor: Boolean(auth.challengeId),
        running: jobIsRunning(),
        finalizerConfigured: Boolean(finalizerInternalToken),
        baseUrl,
        progress: progressSnapshot(),
        history: job.history,
      }, session.cookie ? { 'Set-Cookie': session.cookie } : {});
    }
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(res, 200, await healthSnapshot());
    }
    if (req.method === 'GET' && url.pathname === '/api/discover/artists') {
      const query = url.searchParams.get('query')?.trim();
      if (!query) return sendJson(res, 400, { error: 'Artist query is required' });
      const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=musicArtist&country=vn&limit=15`);
      if (!response.ok) throw new Error(`iTunes artist search failed: ${response.status}`);
      const payload = await response.json();
      const artists = (payload.results || []).map((artist) => ({
        id: String(artist.artistId), name: artist.artistName, genre: artist.primaryGenreName || '', artworkUrl: artist.artworkUrl100 || '',
      }));
      return sendJson(res, 200, { artists });
    }
    if (req.method === 'GET' && url.pathname === '/api/discover/tracks') {
      const query = url.searchParams.get('query')?.trim();
      if (!query) return sendJson(res, 400, { error: 'Tên bài hát là bắt buộc' });
      const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&country=vn&limit=30`);
      if (!response.ok) throw new Error(`iTunes track search failed: ${response.status}`);
      const payload = await response.json();
      const tracks = (payload.results || [])
        .filter((track) => track.wrapperType === 'track' && track.trackId && track.artistId && track.collectionId)
        .map((track) => ({
          id: String(track.trackId),
          name: track.trackName || '',
          artistId: String(track.artistId),
          artistName: track.artistName || '',
          albumId: String(track.collectionId),
          albumName: track.collectionName || '',
          durationMs: Number(track.trackTimeMillis || 0),
          releaseDate: track.releaseDate?.slice(0, 10) || '',
          artworkUrl: track.artworkUrl100 || '',
        }));
      return sendJson(res, 200, { tracks });
    }
    if (req.method === 'GET' && url.pathname === '/api/discover/albums') {
      const artistId = url.searchParams.get('artistId')?.trim();
      const artistName = url.searchParams.get('artistName')?.trim();
      if (!artistId || !artistName) {
        return sendJson(res, 400, { error: 'Artist ID and name are required' });
      }
      const response = await fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(artistId)}&entity=album&country=vn&limit=200`);
      if (!response.ok) throw new Error(`iTunes album lookup failed: ${response.status}`);
      const payload = await response.json();
      const albums = (payload.results || [])
        .filter((item) => item.wrapperType === 'collection')
        .filter((album) =>
          String(album.artistId || '') === artistId
          || collectionIncludesArtist(
            album.artistName || album.collectionArtistName,
            artistName,
          ),
        )
        .map((album) => ({
          id: String(album.collectionId), name: album.collectionName, trackCount: album.trackCount || 0, releaseDate: album.releaseDate?.slice(0, 10) || '', artworkUrl: album.artworkUrl100 || '',
        }));
      return sendJson(res, 200, { albums });
    }
    if (req.method === 'GET' && url.pathname === '/api/catalog/artists') {
      const name = url.searchParams.get('name')?.trim();
      if (!name) return sendJson(res, 400, { error: 'Artist name is required' });
      const session = await restoreSession(req);
      if (session.error) throw session.error;
      if (!session.authenticated) return sendJson(res, 200, { artists: [] });
      const token = await accessToken();
      const response = await fetch(
        `${baseUrl}/catalog/${encodeURIComponent('vn')}/search?q=${encodeURIComponent(name)}&types=artists&limit=20`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || `Catalog artist search failed: ${response.status}`);
      const resources = payload?.resources?.artists || payload?.data?.resources?.artists || {};
      const normalized = normalizeArtistName(name);
      const artists = Object.values(resources)
        .filter((artist) => normalizeArtistName(artist?.attributes?.name || artist?.name) === normalized)
        .map((artist) => ({
          id: String(artist.id),
          name: artist?.attributes?.name || artist?.name || name,
          genres: artist?.attributes?.genreNames || artist?.genreNames || [],
          artworkAssetId: artist?.attributes?.artworkAssetId || artist?.artworkAssetId || '',
        }));
      return sendJson(res, 200, { artists });
    }
    if (req.method === 'GET' && url.pathname === '/api/discover/albums/motion-artwork') {
      const albumId = url.searchParams.get('albumId')?.trim();
      if (!albumId || !/^\d+$/.test(albumId)) {
        return sendJson(res, 400, { error: 'Album ID is required' });
      }
      return sendJson(res, 200, {
        albumId,
        videoPresentation: await appleMotionArtwork('album', albumId),
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/login') {
      const body = await readJson(req);
      const result = await apiAuth('/auth/login', {
        identifier: body.identifier,
        password: body.password,
        deviceId: currentDeviceId(),
      });
      const data = responseData(result.payload);
      if (data?.twoFactorRequired) {
        auth.challengeId = data.twoFactorChallengeId || '';
        if (!auth.challengeId) throw new Error('API did not issue a 2FA challenge');
        return sendJson(res, 200, { requiresTwoFactor: true });
      }
      acceptSession(result.response, result.payload);
      return sendJson(res, 200, { authenticated: true }, {
        'Set-Cookie': localRefreshCookie(auth.refreshToken),
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/login/2fa') {
      const body = await readJson(req);
      if (!auth.challengeId) throw new Error('No pending 2FA challenge');
      const code = typeof body.code === 'string' ? body.code.trim() : '';
      const recoveryCode = typeof body.recoveryCode === 'string' ? body.recoveryCode.trim() : '';
      if (!code && !recoveryCode) throw new Error('Enter a 2FA code or recovery code');
      const result = await apiAuth('/auth/2fa/login', {
        challengeId: auth.challengeId,
        ...(code ? { code } : {}),
        ...(recoveryCode ? { recoveryCode } : {}),
      });
      acceptSession(result.response, result.payload);
      return sendJson(res, 200, { authenticated: true }, {
        'Set-Cookie': localRefreshCookie(auth.refreshToken),
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/job-token') {
      if (!validJobSecret(req)) return sendJson(res, 401, { error: 'unauthorized' });
      return sendJson(res, 200, {
        accessToken: await accessToken({ forceRefresh: url.searchParams.get('force') === '1' }),
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/job/start') {
      const body = await readJson(req);
      const session = body.dryRun ? { authenticated: true } : await restoreSession(req);
      if (session.error) throw session.error;
      if (!session.authenticated) return sendJson(res, 401, { error: 'Login required' }, session.cookie ? { 'Set-Cookie': session.cookie } : {});
      await startJob(body);
      return sendJson(res, 202, { running: true }, session.cookie ? { 'Set-Cookie': session.cookie } : {});
    }
    if (req.method === 'POST' && url.pathname === '/api/job/retry-last') {
      const session = await restoreSession(req);
      if (session.error) throw session.error;
      if (!session.authenticated) return sendJson(res, 401, { error: 'Login required' }, session.cookie ? { 'Set-Cookie': session.cookie } : {});
      const previous = job.history.find((entry) =>
        ['failed', 'cancelled'].includes(entry.outcome),
      );
      if (!previous) return sendJson(res, 404, { error: 'Không có job lỗi hoặc đã dừng để tiếp tục.' });
      await startJob({ ...previous.options, expectedSongs: previous.expectedSongs });
      return sendJson(res, 202, { running: true, resumedJobId: previous.id }, session.cookie ? { 'Set-Cookie': session.cookie } : {});
    }
    if (req.method === 'POST' && url.pathname === '/api/job/stop') {
      if (!job.child) return sendJson(res, 409, { error: 'Không có job đang chạy' });
      job.cancelRequested = true;
      if (job.current) job.current.stopRequested = true;
      publishActivity('info', 'Đang dừng job theo yêu cầu');
      publishProgress();
      job.child.kill('SIGTERM');
      return sendJson(res, 200, { ok: true, message: 'Đang dừng job; state đã lưu để có thể tiếp tục.' });
    }
    if (req.method === 'DELETE' && /^\/api\/music-videos\/[^/]+$/.test(url.pathname)) {
      const session = await restoreSession(req);
      if (session.error) throw session.error;
      if (!session.authenticated) return sendJson(res, 401, { error: 'Login required' });
      const songVideoId = decodeURIComponent(url.pathname.split('/')[3]);
      if (!UUID_PATTERN.test(songVideoId)) throw new RequestError(400, 'Music video ID must be a UUID');
      const { deleteAsset = false } = await readJson(req);
      const token = await accessToken();
      const unlinked = await fetch(`${baseUrl}/admin/catalog/song-videos/${encodeURIComponent(songVideoId)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await unlinked.json().catch(() => ({}));
      if (!unlinked.ok) {
        throw new RequestError(unlinked.status, payload.message || 'Could not unlink music video');
      }
      const assetId = String(payload.videoAssetId || '').trim();
      if (!deleteAsset || !assetId || payload.assetUsagePending) {
        return sendJson(res, 200, {
          unlinked: true,
          assetId,
          assetDeleted: false,
          assetUsagePending: Boolean(payload.assetUsagePending),
        });
      }
      const deleted = await fetch(`${baseUrl}/admin/assets/${encodeURIComponent(assetId)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
      const deletedPayload = await deleted.json().catch(() => ({}));
      // Unlinking has succeeded even if the asset is shared or its cleanup is
      // still propagating. Keep that outcome visible instead of reporting a
      // misleading failed removal.
      return sendJson(res, 200, {
        unlinked: true,
        assetId,
        assetDeleted: deleted.ok && deletedPayload.success !== false,
        assetUsagePending: !deleted.ok,
      });
    }
    if (req.method === 'POST' && /^\/api\/music-videos\/[^/]+\/poster$/.test(url.pathname)) {
      const session = await restoreSession(req);
      if (session.error) throw session.error;
      if (!session.authenticated) return sendJson(res, 401, { error: 'Login required' });
      const songVideoId = decodeURIComponent(url.pathname.split('/')[3]);
      const { posterTimestampMillis } = await readJson(req);
      if (!UUID_PATTERN.test(songVideoId)) {
        throw new RequestError(400, 'Music video ID must be a UUID');
      }
      if (!Number.isSafeInteger(posterTimestampMillis) || posterTimestampMillis < 0) {
        throw new RequestError(400, 'Poster timestamp must be a non-negative integer');
      }
      const token = await accessToken();
      const videoResponse = await fetch(
        `${baseUrl}/catalog/vn/music-videos/${encodeURIComponent(songVideoId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const video = await videoResponse.json().catch(() => ({}));
      const assetId = String(video.videoAssetId || '').trim();
      if (!videoResponse.ok || !UUID_PATTERN.test(assetId)) {
        throw new RequestError(videoResponse.status, video.message || 'Music video not found');
      }
      const replaced = await fetch(
        `${baseUrl}/admin/assets/${encodeURIComponent(assetId)}/poster`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ posterTimestampMillis }),
        },
      );
      const replacement = await replaced.json().catch(() => ({}));
      if (!replaced.ok) {
        const message = [
          replacement.message,
          replacement.detail,
          replacement.error?.message,
          replacement.error,
        ].find((value) => typeof value === 'string' && value.trim());
        throw new RequestError(replaced.status, message || 'Could not replace music video poster');
      }
      return sendJson(res, 200, { assetId, asset: replacement.asset });
    }
    if (req.method === 'POST' && url.pathname === '/api/music-videos/upload') {
      const session = await restoreSession(req);
      if (session.error) throw session.error;
      if (!session.authenticated) return sendJson(res, 401, { error: 'Login required' });
      const body = await readJson(req);
      const width = Number(body.width || 0);
      const height = Number(body.height || 0);
      const posterTimestampMillis = Number(body.posterTimestampMillis || 0);
      if (
        !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0
      ) {
        throw new RequestError(400, 'Music video dimensions must be positive');
      }
      if (!Number.isSafeInteger(posterTimestampMillis) || posterTimestampMillis < 0) {
        throw new RequestError(400, 'Poster timestamp must be a non-negative integer');
      }
      return sendJson(res, 200, await prepareSystemMediaUpload({
        kind: 'VIDEO',
        purpose: 'MUSIC_VIDEO',
        filename: String(body.filename || 'music-video.mp4'),
        contentType: String(body.contentType || ''),
        checksum: String(body.checksum || ''),
        sizeBytes: Number(body.sizeBytes || 0),
        posterTimestampMillis,
        allowedContentTypes: EDITORIAL_VIDEO_TYPES,
        maxBytes: MAX_MUSIC_VIDEO_FILE_BYTES,
        label: 'Music video',
      }));
    }
    if (req.method === 'GET' && /^\/api\/music-videos\/[^/]+\/check$/.test(url.pathname)) {
      const session = await restoreSession(req);
      if (session.error) throw session.error;
      if (!session.authenticated) return sendJson(res, 401, { error: 'Login required' });
      const songId = decodeURIComponent(url.pathname.split('/')[3]);
      if (!UUID_PATTERN.test(songId)) throw new RequestError(400, 'Song ID must be a UUID');
      const response = await fetch(`${baseUrl}/songs/private/${encodeURIComponent(songId)}`, {
        headers: { Authorization: `Bearer ${await accessToken()}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.song) {
        throw new RequestError(response.status, payload.message || 'Song not found or inaccessible');
      }
      return sendJson(res, 200, { song: payload.song });
    }
    if (req.method === 'POST' && /^\/api\/music-videos\/[^/]+\/transfer$/.test(url.pathname)) {
      const session = await restoreSession(req);
      if (session.error) throw session.error;
      if (!session.authenticated) return sendJson(res, 401, { error: 'Login required' });
      const songId = decodeURIComponent(url.pathname.split('/')[3]);
      if (!UUID_PATTERN.test(songId)) throw new RequestError(400, 'Song ID must be a UUID');
      const assetId = String(url.searchParams.get('assetId') || '').trim();
      await transferSystemMediaUpload(req, assetId, 'Music video');
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'POST' && /^\/api\/music-videos\/[^/]+\/bind$/.test(url.pathname)) {
      const session = await restoreSession(req);
      if (session.error) throw session.error;
      if (!session.authenticated) return sendJson(res, 401, { error: 'Login required' });
      const songId = decodeURIComponent(url.pathname.split('/')[3]);
      if (!UUID_PATTERN.test(songId)) throw new RequestError(400, 'Song ID must be a UUID');
      const { assetId } = await readJson(req);
      if (!UUID_PATTERN.test(String(assetId || ''))) throw new RequestError(400, 'Video asset ID is invalid');
      const finalized = await fetch(`${baseUrl}/admin/assets/${encodeURIComponent(assetId)}/finalize`, {
        method: 'POST', headers: { Authorization: `Bearer ${await accessToken()}` },
      });
      if (!finalized.ok) throw new RequestError(finalized.status, 'Could not finalize music video');
      await resumeMusicVideoPublish(songId, assetId);
      return sendJson(res, 202, {
        assetId,
        status: 'PROCESSING',
        pollIntervalMs: assetReadyWaitPollMs,
        timeoutMs: assetReadyWaitTimeoutMs,
      });
    }
    if (req.method === 'GET' && /^\/api\/music-videos\/[^/]+\/status$/.test(url.pathname)) {
      const session = await restoreSession(req);
      if (session.error) throw session.error;
      if (!session.authenticated) return sendJson(res, 401, { error: 'Login required' });
      const songId = decodeURIComponent(url.pathname.split('/')[3]);
      const assetId = String(url.searchParams.get('assetId') || '').trim();
      if (!UUID_PATTERN.test(songId) || !UUID_PATTERN.test(assetId)) {
        throw new RequestError(400, 'Song ID and video asset ID must be UUIDs');
      }
      const job = await resumeMusicVideoPublish(songId, assetId);
      if (job.status === 'READY' || job.status === 'FAILED') {
        return sendJson(res, 200, { status: job.status, assetId, draftId: job.draftId, error: job.error });
      }
      if (job.status === 'PUBLISHING') return sendJson(res, 200, { status: 'PUBLISHING', assetId });
      const token = await accessToken();
      const current = await fetch(`${baseUrl}/admin/assets/${encodeURIComponent(assetId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await current.json().catch(() => ({}));
      const asset = payload.asset ?? payload;
      if (!current.ok) throw new RequestError(current.status, payload.message || 'Could not check music video processing');
      if (asset?.status === 'FAILED' || asset?.status === 4) {
        job.status = 'FAILED';
        job.error = 'Music video processing failed';
        return sendJson(res, 200, { status: job.status, assetId, error: job.error });
      }
      if (asset?.status !== 'READY' && asset?.status !== 3) {
        return sendJson(res, 200, { status: 'PROCESSING', assetId });
      }
      job.status = 'PUBLISHING';
      try {
        job.draftId = await publishedMusicVideoId(songId, assetId, token)
          || await publishMusicVideo(songId, assetId, token);
        job.status = 'READY';
      } catch (error) {
        job.status = 'FAILED';
        job.error = error instanceof Error ? error.message : 'Could not publish music video';
      }
      return sendJson(res, 200, { status: job.status, assetId, draftId: job.draftId, error: job.error });
    }
    if (
      req.method === 'POST'
      && (url.pathname === '/api/artwork-theme/preview' || url.pathname === '/api/artwork-theme/apply')
    ) {
      const session = await restoreSession(req);
      if (session.error) throw session.error;
      if (!session.authenticated) {
        return sendJson(res, 401, { error: 'Login required' }, session.cookie ? { 'Set-Cookie': session.cookie } : {});
      }
      const body = await readJson(req);
      const result = await refreshArtworkTheme({
        ...artworkThemeTarget(body),
        dryRun: url.pathname.endsWith('/preview'),
      });
      return sendJson(res, 200, result, session.cookie ? { 'Set-Cookie': session.cookie } : {});
    }
    if (
      req.method === 'POST'
      && /^\/api\/system-playlists\/(get-up|chill|new-music|heavy-rotation)\/video-upload$/.test(url.pathname)
    ) {
      const session = await restoreSession(req);
      if (session.error) throw session.error;
      if (!session.authenticated) return sendJson(res, 401, { error: 'Login required' });
      const body = await readJson(req);
      const contentType = String(body.contentType || '');
      const sizeBytes = Number(body.sizeBytes || 0);
      return sendJson(res, 200, await prepareSystemMediaUpload({
        kind: 'VIDEO',
        purpose: 'EDITORIAL_VIDEO',
        filename: String(body.filename || 'system-playlist-video.mov'),
        contentType,
        checksum: String(body.checksum || ''),
        sizeBytes,
        allowedContentTypes: EDITORIAL_VIDEO_TYPES,
        maxBytes: 150 * 1024 * 1024,
        label: 'Video',
      }));
    }
    if (
      req.method === 'POST'
      && /^\/api\/system-playlists\/(get-up|chill|new-music|heavy-rotation)\/video-transfer$/.test(url.pathname)
    ) {
      const session = await restoreSession(req);
      if (session.error) throw session.error;
      if (!session.authenticated) return sendJson(res, 401, { error: 'Login required' });
      const assetId = String(url.searchParams.get('assetId') || '').trim();
      await transferSystemMediaUpload(req, assetId, 'Video');
      return sendJson(res, 200, { ok: true });
    }
    if (
      req.method === 'POST'
      && /^\/api\/system-playlists\/(get-up|chill|new-music|heavy-rotation)\/video-bind$/.test(url.pathname)
    ) {
      const session = await restoreSession(req);
      if (session.error) throw session.error;
      if (!session.authenticated) return sendJson(res, 401, { error: 'Login required' });
      const body = await readJson(req);
      const playlistKey = url.pathname.split('/')[3];
      const assetIds = [body.detailSquareVideoAssetId, body.detailMobileVideoAssetId, body.homeHeroVideoAssetId]
        .map((id) => String(id || '').trim());
      if (assetIds.some((id) => !id)) throw new RequestError(400, 'Three video asset IDs are required');
      const token = await finalizeSystemMediaAssets(assetIds, 'Video');
      const bound = await fetch(`${baseUrl}/admin/recommendations/system-playlist-artwork/${encodeURIComponent(playlistKey)}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ detailSquareVideoAssetId: assetIds[0], detailMobileVideoAssetId: assetIds[1], homeHeroVideoAssetId: assetIds[2] }),
      });
      const payload = await bound.json().catch(() => ({}));
      if (!bound.ok) throw new RequestError(bound.status, payload.message || 'Could not bind playlist videos');
      await regenerateGlobalHome(token);
      return sendJson(res, 200, payload);
    }
    if (
      req.method === 'POST'
      && /^\/api\/system-stations\/[a-z-]+\/media-upload$/.test(url.pathname)
    ) {
      const session = await restoreSession(req);
      if (session.error) throw session.error;
      if (!session.authenticated) return sendJson(res, 401, { error: 'Login required' });
      const body = await readJson(req);
      const mediaType = String(body.mediaType || '');
      if (mediaType !== 'cover' && mediaType !== 'hero-video') {
        throw new RequestError(400, 'mediaType must be cover or hero-video');
      }
      const contentType = String(body.contentType || '');
      const sizeBytes = Number(body.sizeBytes || 0);
      const isCover = mediaType === 'cover';
      return sendJson(res, 200, await prepareSystemMediaUpload({
        kind: isCover ? 'IMAGE' : 'VIDEO',
        purpose: isCover ? 'ARTWORK' : 'EDITORIAL_VIDEO',
        filename: String(body.filename || `system-station-${mediaType}`),
        contentType,
        checksum: String(body.checksum || ''),
        sizeBytes,
        allowedContentTypes: isCover ? ARTWORK_IMAGE_TYPES : EDITORIAL_VIDEO_TYPES,
        maxBytes: isCover ? MAX_ARTWORK_IMAGE_FILE_BYTES : 150 * 1024 * 1024,
        label: isCover ? 'Cover' : 'Hero video',
      }));
    }
    if (
      req.method === 'POST'
      && /^\/api\/system-stations\/[a-z-]+\/media-transfer$/.test(url.pathname)
    ) {
      const session = await restoreSession(req);
      if (session.error) throw session.error;
      if (!session.authenticated) return sendJson(res, 401, { error: 'Login required' });
      const assetId = String(url.searchParams.get('assetId') || '').trim();
      await transferSystemMediaUpload(req, assetId, 'Station media');
      return sendJson(res, 200, { ok: true });
    }
    if (
      req.method === 'POST'
      && /^\/api\/system-stations\/[a-z-]+\/media-bind$/.test(url.pathname)
    ) {
      const session = await restoreSession(req);
      if (session.error) throw session.error;
      if (!session.authenticated) return sendJson(res, 401, { error: 'Login required' });
      const stationKey = url.pathname.split('/')[3];
      const body = await readJson(req);
      const coverAssetId = String(body.coverAssetId || '').trim();
      const heroVideoAssetId = String(body.heroVideoAssetId || '').trim();
      if (!coverAssetId || !heroVideoAssetId) throw new RequestError(400, 'Cover and Hero video asset IDs are required');
      const token = await finalizeSystemMediaAssets(
        [coverAssetId, heroVideoAssetId],
        'Station media',
      );
      const bound = await fetch(`${baseUrl}/admin/recommendations/station-artwork/${encodeURIComponent(stationKey)}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverAssetId, heroVideoAssetId }),
      });
      const payload = await bound.json().catch(() => ({}));
      if (!bound.ok) throw new RequestError(bound.status, payload.message || 'Could not bind station media');
      await regenerateGlobalHome(token);
      return sendJson(res, 200, payload);
    }
    if (
      req.method === 'PUT'
      && /^\/api\/system-playlists\/(get-up|chill|new-music|heavy-rotation)\/artwork\/color$/.test(url.pathname)
    ) {
      const session = await restoreSession(req);
      if (session.error) throw session.error;
      if (!session.authenticated) {
        return sendJson(res, 401, { error: 'Login required' });
      }
      const body = await readJson(req);
      const playlistKey = url.pathname.split('/')[3];
      const response = await fetch(
        `${baseUrl}/admin/recommendations/system-playlist-artwork/${encodeURIComponent(playlistKey)}/color`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${await accessToken()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ bgColor: body.bgColor }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new RequestError(
          response.status,
          payload.message || payload.error || 'Could not update playlist color',
        );
      }
      await regenerateGlobalHome(await accessToken());
      return sendJson(res, 200, payload);
    }
    return sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    return sendJson(
      res,
      error instanceof RequestError ? error.statusCode : 500,
      { error: error instanceof Error ? error.message : 'Unknown error' },
    );
  }
});

// Large media is proxied through this local server. Node defaults to five
// minutes, which is too short for a slow 120 MB+ upload.
server.requestTimeout = mediaTransferTimeoutMs;

server.listen(port, '127.0.0.1', () => {
  console.log(`Seed Studio running at http://127.0.0.1:${port}`);
});

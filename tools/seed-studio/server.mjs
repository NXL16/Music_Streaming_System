import { createServer } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const require = createRequire(import.meta.url);
const { SONG_CREDIT_ROLE_GROUPS } = require(
  join(root, 'packages', 'shared-constants', 'dist', 'index.js'),
);
const config = loadEnv(join(here, '.env'));
const workerConfig = loadEnv(join(root, 'apps', 'worker', '.env'));
const baseUrl = (config.BASE_URL || 'http://localhost:9999/v1').replace(/\/+$/, '');
const port = Number(config.PORT || 4311);
const finalizerInternalToken =
  config.FINALIZER_INTERNAL_TOKEN || config.INTERNAL_TOKEN || '';
const seedArtistPassword = config.SEED_ARTIST_PASSWORD || process.env.SEED_ARTIST_PASSWORD || '';
const runtimeDir = join(here, '.tmp');
const historyPath = join(runtimeDir, 'job-history.json');
const deviceIdentityPath = join(runtimeDir, 'device.json');
const localRefreshCookieName = 'seed_studio_refresh';
const refreshSessionMaxAgeSeconds = 7 * 24 * 60 * 60;
const seedDeviceTrustMaxAgeMs = 30 * 24 * 60 * 60 * 1000;

const auth = { accessToken: '', refreshToken: '', expiresAt: 0, challengeId: '' };
const job = {
  child: null,
  starting: false,
  secret: '',
  clients: new Set(),
  activities: [],
  outputBuffers: { stdout: '', stderr: '' },
  cancelRequested: false,
  creditReview: null,
  current: null,
  history: readHistory(),
};
const MAX_JSON_BODY_BYTES = 64 * 1024;

if (!config.FINALIZER_INTERNAL_TOKEN && config.INTERNAL_TOKEN) {
  console.warn(
    '[seed-studio] INTERNAL_TOKEN is deprecated; rename it to FINALIZER_INTERNAL_TOKEN.',
  );
}

class RequestError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function normalizeArtistName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
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

function clearCreditReview(result = { credits: [] }) {
  const pending = job.creditReview;
  if (!pending) return;
  job.creditReview = null;
  pending.resolve(result);
  publish('credit-review', null);
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

function updateSong(title, status, detail = '', songId = '') {
  const current = job.current;
  if (!current || !title) return;
  const key = title.trim().toLocaleLowerCase('vi');
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
  auth.expiresAt = Date.now() + 12 * 60 * 1000;
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

async function accessToken() {
  if (auth.accessToken && Date.now() < auth.expiresAt) return auth.accessToken;
  if (!auth.refreshToken) throw new Error('Seed Studio is not authenticated');
  const { response, payload } = await apiAuth('/auth/refresh', {}, `refresh_token=${auth.refreshToken}`);
  acceptSession(response, payload);
  return auth.accessToken;
}

async function restoreSession(req) {
  const refreshToken = requestCookies(req)[localRefreshCookieName];
  if (!refreshToken) return { authenticated: Boolean(auth.refreshToken) };

  if (refreshToken !== auth.refreshToken) {
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

function hasLocalStudioSession(req) {
  const refreshToken = requestCookies(req)[localRefreshCookieName];
  return Boolean(auth.refreshToken) && (!refreshToken || refreshToken === auth.refreshToken);
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
  if (/phase 1|searching apple music/i.test(line)) return publishActivity('working', 'Đang tìm metadata nghệ sĩ');
  if (/downloading audio/i.test(line)) return publishActivity('working', 'Đang tải audio nguồn');
  if (/uploading song/i.test(line)) return publishActivity('working', 'Đang upload bài hát', line.replace(/^.*Uploading song\s*/i, ''));
  if (/calling finalize/i.test(line)) return publishActivity('working', 'Đang đưa bài vào hàng đợi xử lý');
  if (/waiting for song/i.test(line)) return publishActivity('working', 'Worker đang xử lý bài hát');
  if (/yt-dlp.*(?:HTTP Error 403|forbidden)/i.test(line)) {
    return publishActivity(
      'info',
      'Nguồn YouTube không phản hồi, đang thử nguồn kế tiếp',
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
    if (!options.dryRun && !finalizerInternalToken) {
      throw new Error(
        'FINALIZER_INTERNAL_TOKEN is missing in tools/seed-studio/.env',
      );
    }
    if (!options.dryRun && !seedArtistPassword) {
      throw new Error(
        'SEED_ARTIST_PASSWORD is missing in tools/seed-studio/.env',
      );
    }

    const args = [
      join(root, 'tools', 'scripts', 'seed-artist.mjs'),
      options.artistQuery.trim(),
    ];
    if (!options.artistId?.trim()) throw new Error('Select an artist first');
    if (!Array.isArray(options.albumIds) || options.albumIds.length === 0) {
      throw new Error('Select at least one album');
    }
    const audioMode = String(options.audioMode || 'STANDARD').toUpperCase();
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
    if (options.dryRun) args.push('--dry-run');
      if (options.noYoutube) args.push('--no-youtube');
      if (options.noSoundcloud) args.push('--no-soundcloud');

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
          audioMode,
        dryRun: Boolean(options.dryRun),
        noYoutube: Boolean(options.noYoutube),
        noSoundcloud: Boolean(options.noSoundcloud),
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
      job.creditReview = null;
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
      clearCreditReview({ credits: [] });
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
      res.write(`event: credit-review\ndata: ${JSON.stringify(job.creditReview?.public || null)}\n\n`);
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
        creditReview: job.creditReview?.public || null,
      }, session.cookie ? { 'Set-Cookie': session.cookie } : {});
    }
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(res, 200, await healthSnapshot());
    }
    if (req.method === 'GET' && url.pathname === '/api/song-credit-roles') {
      return sendJson(res, 200, { groups: SONG_CREDIT_ROLE_GROUPS });
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
        .filter((album) => collectionIncludesArtist(
          album.artistName || album.collectionArtistName,
          artistName,
        ))
        .map((album) => ({
        id: String(album.collectionId), name: album.collectionName, trackCount: album.trackCount || 0, releaseDate: album.releaseDate?.slice(0, 10) || '', artworkUrl: album.artworkUrl100 || '',
        }));
      return sendJson(res, 200, { albums });
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
      return sendJson(res, 200, { accessToken: await accessToken() });
    }
    if (req.method === 'POST' && url.pathname === '/api/job/credit-review') {
      if (!validJobSecret(req)) return sendJson(res, 401, { error: 'unauthorized' });
      if (job.creditReview) return sendJson(res, 409, { error: 'Một credit review khác đang chờ duyệt.' });
      const body = await readJson(req);
      const track = body?.track;
      if (!track || typeof track.name !== 'string' || !track.name.trim()) {
        return sendJson(res, 400, { error: 'Thông tin bài hát không hợp lệ.' });
      }
      const id = randomUUID();
      const publicReview = {
        id,
        track: {
          id: String(track.id || ''),
          name: track.name.trim(),
          artistName: String(track.artistName || ''),
          albumName: String(track.albumName || ''),
          artworkUrl: String(track.artworkUrl || ''),
        },
        suggestions: Array.isArray(body.suggestions) ? body.suggestions.slice(0, 30).map((credit) => ({
          name: String(credit?.name || '').trim().slice(0, 255),
          role: String(credit?.role || '').trim().slice(0, 32),
          source: String(credit?.source || '').trim().slice(0, 64),
        })).filter((credit) => credit.name && credit.role) : [],
        lookup: {
          source: 'MusicBrainz',
          status: ['suggested', 'no_credits', 'not_found', 'unavailable'].includes(body.lookup?.status)
            ? body.lookup.status
            : 'unavailable',
        },
      };
      const result = await new Promise((resolve) => {
        job.creditReview = { public: publicReview, resolve };
        publishActivity('info', 'Đang chờ duyệt credit', publicReview.track.name);
        publish('credit-review', publicReview);
      });
      return sendJson(res, 200, result);
    }
    if (req.method === 'POST' && url.pathname.startsWith('/api/job/credit-review/')) {
      // Releasing the local seed child does not require a network token refresh.
      // A pending refresh here previously made this action look permanently stuck.
      if (!hasLocalStudioSession(req)) return sendJson(res, 401, { error: 'Login required' });
      const id = url.pathname.split('/').pop();
      if (!job.creditReview || job.creditReview.public.id !== id) {
        return sendJson(res, 404, { error: 'Credit review này không còn chờ duyệt.' });
      }
      const body = await readJson(req);
      const credits = Array.isArray(body.credits) ? body.credits.slice(0, 30).map((credit) => ({
        name: String(credit?.name || '').trim().slice(0, 255),
        role: String(credit?.role || '').trim().slice(0, 32),
      })) : [];
      clearCreditReview({ credits });
      return sendJson(res, 200, { ok: true });
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
      clearCreditReview({ credits: [] });
      publishProgress();
      job.child.kill('SIGTERM');
      return sendJson(res, 200, { ok: true, message: 'Đang dừng job; state đã lưu để có thể tiếp tục.' });
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

server.listen(port, '127.0.0.1', () => {
  console.log(`Seed Studio running at http://127.0.0.1:${port}`);
});

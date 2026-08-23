import { existsSync, readFileSync } from 'node:fs';
import { createConnection } from 'node:net';

const COMPLETION_QUEUE = 'song_completion_queue';
const COMPLETION_DLQ = `${COMPLETION_QUEUE}:dlq`;
const MISSING_PAYLOAD_ERROR = 'Completion entry missing payload';
const APPLY = process.argv.includes('--apply');
const MARKER_TTL_SECONDS = 30 * 24 * 60 * 60;
const SCAN_LIMIT = positiveInteger(
  process.env.COMPLETION_DLQ_REPLAY_SCAN_LIMIT,
  1000,
);

// The marker and XADD run in one Redis transaction so rerunning this recovery
// tool cannot enqueue the same false-DLQ entry twice.
const REPLAY_SCRIPT = [
  "if redis.call('EXISTS', KEYS[1]) == 1 then return {0, redis.call('GET', KEYS[1])} end",
  "local replayId = redis.call('XADD', KEYS[2], '*', 'payload', ARGV[1], 'replayed_from_dlq', ARGV[2])",
  "redis.call('SET', KEYS[1], replayId, 'EX', ARGV[3])",
  'return {1, replayId}',
].join('\n');

async function main() {
  const redis = await RedisConnection.connect(redisConfig());
  try {
    const entries = await redis.command([
      'XRANGE',
      COMPLETION_DLQ,
      '-',
      '+',
      'COUNT',
      String(SCAN_LIMIT),
    ]);
    if (!Array.isArray(entries)) {
      throw new Error('Redis returned an invalid completion DLQ response');
    }

    const summary = {
      mode: APPLY ? 'apply' : 'dry-run',
      scanned: entries.length,
      candidates: 0,
      replayed: 0,
      alreadyReplayed: 0,
      skipped: 0,
    };

    for (const entry of entries) {
      const dlq = streamFields(entry);
      if (
        dlq.get('error') !== MISSING_PAYLOAD_ERROR ||
        dlq.get('source_stream') !== COMPLETION_QUEUE
      ) {
        summary.skipped += 1;
        continue;
      }

      const sourceId = dlq.get('source_id');
      if (!sourceId) {
        summary.skipped += 1;
        continue;
      }
      const sourceEntries = await redis.command([
        'XRANGE',
        COMPLETION_QUEUE,
        sourceId,
        sourceId,
      ]);
      const payload = Array.isArray(sourceEntries)
        ? streamFields(sourceEntries[0]).get('payload')
        : undefined;
      if (!isSuccessfulCompletion(payload)) {
        // Do not replay an old error event. The worker may still be retrying
        // it; only the terminal worker path is allowed to mark Song FAILED.
        summary.skipped += 1;
        continue;
      }

      summary.candidates += 1;
      if (!APPLY) continue;

      const marker = `recovery:song_completion:missing_payload:${sourceId}`;
      const result = await redis.command([
        'EVAL',
        REPLAY_SCRIPT,
        '2',
        marker,
        COMPLETION_QUEUE,
        payload,
        sourceId,
        String(MARKER_TTL_SECONDS),
      ]);
      if (!Array.isArray(result)) {
        throw new Error('Redis returned an invalid completion replay response');
      }
      if (Number(result[0]) === 1) summary.replayed += 1;
      else summary.alreadyReplayed += 1;
    }

    console.log(JSON.stringify(summary));
    if (!APPLY && summary.candidates > 0) {
      console.log('Dry run only. Restart Song and Worker, then rerun with --apply.');
    }
  } finally {
    redis.close();
  }
}

function isSuccessfulCompletion(payload) {
  if (!payload) return false;
  try {
    const event = JSON.parse(payload);
    return (
      event?.status === 'success' &&
      typeof event.song_id === 'string' &&
      event.song_id.length > 0 &&
      Number.isSafeInteger(event.metadata_version) &&
      event.metadata_version > 0
    );
  } catch {
    return false;
  }
}

function streamFields(entry) {
  const fields = Array.isArray(entry) && Array.isArray(entry[1]) ? entry[1] : [];
  const result = new Map();
  for (let index = 0; index + 1 < fields.length; index += 2) {
    const field = fields[index];
    const value = fields[index + 1];
    if (typeof field === 'string' && typeof value === 'string') {
      result.set(field, value);
    }
  }
  return result;
}

function redisConfig() {
  const env = {
    ...readEnv('apps/song/.env'),
    ...readEnv('apps/worker/.env'),
    ...process.env,
  };
  if (env.REDIS_URL) return new URL(env.REDIS_URL);

  const host = env.REDIS_HOST || '127.0.0.1';
  const port = env.REDIS_PORT || '6379';
  const credentials = env.REDIS_PASSWORD
    ? `${env.REDIS_USERNAME ? encodeURIComponent(env.REDIS_USERNAME) : ''}:${encodeURIComponent(env.REDIS_PASSWORD)}@`
    : '';
  return new URL(`redis://${credentials}${host}:${port}`);
}

function readEnv(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .flatMap((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return [];
        const separator = trimmed.indexOf('=');
        if (separator < 1) return [];
        const key = trimmed.slice(0, separator).trim();
        const rawValue = trimmed.slice(separator + 1).trim();
        const value = rawValue.replace(/^(['"])(.*)\1$/, '$2');
        return [[key, value]];
      }),
  );
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

class RedisConnection {
  static async connect(url) {
    const client = new RedisConnection(url);
    await client.open();
    return client;
  }

  constructor(url) {
    this.url = url;
    this.buffer = Buffer.alloc(0);
    this.pending = [];
  }

  async open() {
    this.socket = createConnection({
      host: this.url.hostname,
      port: Number(this.url.port || 6379),
    });
    this.socket.setTimeout(10_000);
    this.socket.on('data', (chunk) => this.consume(chunk));
    this.socket.on('error', (error) => this.rejectAll(error));
    this.socket.on('timeout', () => {
      this.rejectAll(new Error('Redis command timed out'));
      this.socket.destroy();
    });

    await new Promise((resolve, reject) => {
      this.socket.once('connect', resolve);
      this.socket.once('error', reject);
    });
    if (!this.url.password) return;

    const username = this.url.username ? decodeURIComponent(this.url.username) : '';
    const password = decodeURIComponent(this.url.password);
    const response = await this.command(
      username ? ['AUTH', username, password] : ['AUTH', password],
    );
    if (response !== 'OK') throw new Error('Redis authentication failed');
  }

  command(parts) {
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
      this.socket.write(encodeCommand(parts));
    });
  }

  consume(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.pending.length) {
      const parsed = parseResponse(this.buffer);
      if (!parsed) return;
      this.buffer = this.buffer.subarray(parsed.offset);
      const pending = this.pending.shift();
      if (parsed.error) pending.reject(parsed.error);
      else pending.resolve(parsed.value);
    }
  }

  rejectAll(error) {
    while (this.pending.length) this.pending.shift().reject(error);
  }

  close() {
    this.socket?.end();
  }
}

function encodeCommand(parts) {
  const encoded = parts.map((part) => String(part));
  return Buffer.from(
    `*${encoded.length}\r\n${encoded
      .map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`)
      .join('')}`,
  );
}

function parseResponse(buffer, offset = 0) {
  const lineEnd = buffer.indexOf('\r\n', offset);
  if (lineEnd === -1) return null;

  const prefix = String.fromCharCode(buffer[offset]);
  const header = buffer.toString('utf8', offset + 1, lineEnd);
  const bodyOffset = lineEnd + 2;
  if (prefix === '+') return { value: header, offset: bodyOffset };
  if (prefix === '-') return { error: new Error(`Redis command failed: ${header}`), offset: bodyOffset };
  if (prefix === ':') return { value: Number(header), offset: bodyOffset };
  if (prefix === '$') {
    const size = Number(header);
    if (size === -1) return { value: null, offset: bodyOffset };
    const end = bodyOffset + size;
    if (buffer.length < end + 2) return null;
    return { value: buffer.toString('utf8', bodyOffset, end), offset: end + 2 };
  }
  if (prefix === '*') {
    const length = Number(header);
    if (length === -1) return { value: null, offset: bodyOffset };
    const values = [];
    let nextOffset = bodyOffset;
    for (let index = 0; index < length; index += 1) {
      const parsed = parseResponse(buffer, nextOffset);
      if (!parsed) return null;
      if (parsed.error) return parsed;
      values.push(parsed.value);
      nextOffset = parsed.offset;
    }
    return { value: values, offset: nextOffset };
  }
  throw new Error(`Unsupported Redis response prefix: ${prefix}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

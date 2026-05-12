// ─── Types ────────────────────────────────────────────────────────────────────

export type SongKey = {
  cryptoKey: CryptoKey;
  iv: Uint8Array;
};

// ─── KV schema ────────────────────────────────────────────────────────────────

/**
 * Schema lưu trong KV:
 *   key:   "song:{songId}"
 *   value: JSON { encryptionKey: string (base64url), iv: string (base64url) }
 *
 * Write từ upload pipeline:
 *   await env.SONG_KEYS.put(`song:${songId}`, JSON.stringify({ encryptionKey, iv }));
 *
 * Không set TTL — key vĩnh viễn theo bài hát.
 */
type KvKeyPayload = {
  encryptionKey: string;
  iv: string;
};

// ─── In-isolate dedup cache ───────────────────────────────────────────────────

/**
 * Cache Promise<SongKey> trong lifetime của isolate.
 * Mục đích: tránh gọi KV nhiều lần cho cùng songId trong 1 request burst
 * (vd: nhiều chunk requests đến cùng lúc cho cùng bài hát).
 *
 * Không cần TTL hay eviction — key là vĩnh viễn và bất biến.
 * KV là source of truth; đây chỉ là micro-latency optimization.
 */
const isolateCache = new Map<string, Promise<SongKey>>();

export async function getSongKey(
  kv: KVNamespace,
  songId: string,
): Promise<SongKey> {
  const cached = isolateCache.get(songId);
  if (cached) return cached;

  const promise = fetchFromKv(kv, songId).catch((err) => {
    // Xóa để cho phép retry nếu KV tạm thời lỗi
    isolateCache.delete(songId);
    throw err;
  });

  isolateCache.set(songId, promise);

  if (isolateCache.size > 512) {
    const oldest = isolateCache.keys().next().value;
    if (oldest) isolateCache.delete(oldest);
  }

  return promise;
}

async function fetchFromKv(kv: KVNamespace, songId: string): Promise<SongKey> {
  const raw = await kv.get(`song:${songId}`);

  if (!raw) {
    throw new Error(`Song key not found: ${songId}`);
  }

  let payload: KvKeyPayload;
  try {
    payload = JSON.parse(raw) as KvKeyPayload;
  } catch {
    throw new Error(`Malformed key payload for song: ${songId}`);
  }

  if (!payload.encryptionKey || !payload.iv) {
    throw new Error(`Incomplete key payload for song: ${songId}`);
  }

  const keyBytes = base64ToBytes(payload.encryptionKey);
  const iv = base64ToBytes(payload.iv);

  if (iv.byteLength !== 16) {
    throw new Error(
      `Invalid IV length for ${songId}: expected 16, got ${iv.byteLength}`,
    );
  }

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-CTR" },
    false,
    ["decrypt"],
  );

  return { cryptoKey, iv };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function base64ToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padding);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ─── AES-CTR counter ──────────────────────────────────────────────────────────

function incrementCounter(counter: Uint8Array, blocks: number): void {
  let carry = blocks;
  for (let i = counter.length - 1; i >= 0 && carry > 0; i--) {
    const sum = counter[i] + (carry & 0xff);
    counter[i] = sum & 0xff;
    carry = (carry >>> 8) + (sum >>> 8);
  }
}

// ─── Decrypt ──────────────────────────────────────────────────────────────────

async function decryptChunk(
  cryptoKey: CryptoKey,
  iv: Uint8Array,
  chunk: Uint8Array,
  streamOffset: number,
): Promise<Uint8Array> {
  const blockSize = 16;
  const blockIndex = Math.floor(streamOffset / blockSize);
  const offsetInBlock = streamOffset % blockSize;

  const counter = new Uint8Array(iv);
  incrementCounter(counter, blockIndex);

  if (offsetInBlock === 0) {
    const result = await crypto.subtle.decrypt(
      { name: "AES-CTR", counter, length: 128 },
      cryptoKey,
      chunk,
    );
    return new Uint8Array(result);
  }

  // Pad về đầu block để align với AES block boundary
  const padded = new Uint8Array(offsetInBlock + chunk.length);
  padded.set(chunk, offsetInBlock);
  const result = await crypto.subtle.decrypt(
    { name: "AES-CTR", counter, length: 128 },
    cryptoKey,
    padded,
  );
  return new Uint8Array(result).subarray(offsetInBlock);
}

export function decryptAesCtrStream(
  body: ReadableStream<Uint8Array>,
  cryptoKey: CryptoKey,
  iv: Uint8Array,
  startOffset: number,
): ReadableStream<Uint8Array> {
  let processed = 0;

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>(
      {
        async transform(chunk, controller) {
          const streamOffset = startOffset + processed;
          try {
            const decrypted = await decryptChunk(
              cryptoKey,
              iv,
              chunk,
              streamOffset,
            );
            processed += chunk.length;
            controller.enqueue(decrypted);
          } catch (err) {
            controller.error(
              new Error(`Decrypt failed at offset ${streamOffset}: ${err}`),
            );
          }
        },
      },
      new CountQueuingStrategy({ highWaterMark: 4 }),
      new CountQueuingStrategy({ highWaterMark: 4 }),
    ),
  );
}

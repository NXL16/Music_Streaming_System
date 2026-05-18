const KEY_INFO = new TextEncoder().encode("music-stream:v1:key");
const IV_INFO = new TextEncoder().encode("music-stream:v1:iv");

const SONG_KEY_CACHE_MAX = 512;
const MIN_DECRYPT_SIZE = 16_384;

let cachedMasterSecret = "";
let cachedHkdfKeyPromise: Promise<CryptoKey> | null = null;
const songKeyCache = new Map<string, Promise<SongKey>>();

export type SongKey = {
  cryptoKey: CryptoKey;
  iv: Uint8Array;
};

export function hexToBytes(input: string): Uint8Array {
  if (!input || input.length % 2 !== 0) {
    throw new Error(
      "MASTER_SECRET_KEY must be a non-empty even-length hex string",
    );
  }
  const bytes = new Uint8Array(input.length / 2);
  for (let i = 0; i < input.length; i += 2) {
    const value = Number.parseInt(input.slice(i, i + 2), 16);
    if (Number.isNaN(value)) {
      throw new Error("MASTER_SECRET_KEY contains invalid hex characters");
    }
    bytes[i / 2] = value;
  }
  return bytes;
}

export async function deriveSongKey(
  masterSecretHex: string,
  songId: string,
): Promise<SongKey> {
  const normalizedSecret = masterSecretHex.trim();

  // Simple LRU: delete + re-insert khi access
  const cached = songKeyCache.get(songId);
  if (cached) {
    songKeyCache.delete(songId);
    songKeyCache.set(songId, cached);
    return cached;
  }

  const promise = deriveSongKeyInternal(normalizedSecret, songId).catch(
    (err) => {
      songKeyCache.delete(songId);
      throw err;
    },
  );

  songKeyCache.set(songId, promise);
  if (songKeyCache.size > SONG_KEY_CACHE_MAX) {
    const oldest = songKeyCache.keys().next().value;
    if (oldest) songKeyCache.delete(oldest);
  }

  return promise;
}

async function deriveSongKeyInternal(
  normalizedSecret: string,
  songId: string,
): Promise<SongKey> {
  const hkdfKey = await getHkdfKey(normalizedSecret);
  const salt = new TextEncoder().encode(songId);
  const [keyBits, ivBits] = await Promise.all([
    crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt, info: KEY_INFO },
      hkdfKey,
      256,
    ),
    crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt, info: IV_INFO },
      hkdfKey,
      128,
    ),
  ]);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(keyBits),
    { name: "AES-CTR" },
    false,
    ["decrypt"],
  );
  return { cryptoKey, iv: new Uint8Array(ivBits) };
}

async function getHkdfKey(masterSecretHex: string): Promise<CryptoKey> {
  if (masterSecretHex !== cachedMasterSecret) {
    cachedMasterSecret = masterSecretHex;
    cachedHkdfKeyPromise = crypto.subtle.importKey(
      "raw",
      hexToBytes(masterSecretHex),
      "HKDF",
      false,
      ["deriveBits"],
    );
    songKeyCache.clear();
  }
  if (!cachedHkdfKeyPromise) throw new Error("Failed to initialize HKDF key");
  return cachedHkdfKeyPromise;
}

function incrementCounter(counter: Uint8Array, blocks: number): void {
  let carry = blocks;
  for (let i = counter.length - 1; i >= 0 && carry > 0; i--) {
    const sum = counter[i] + (carry & 0xff);
    counter[i] = sum & 0xff;
    carry = (carry >>> 8) + (sum >>> 8);
  }
}

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
  let buffer = new Uint8Array(0);

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>(
      {
        async transform(chunk, controller) {
          const merged = new Uint8Array(buffer.length + chunk.length);
          merged.set(buffer);
          merged.set(chunk, buffer.length);
          buffer = merged;

          while (buffer.length >= MIN_DECRYPT_SIZE) {
            const toDecrypt = buffer.subarray(0, MIN_DECRYPT_SIZE);
            const remaining = buffer.subarray(MIN_DECRYPT_SIZE);
            const streamOffset = startOffset + processed;
            try {
              const decrypted = await decryptChunk(
                cryptoKey,
                iv,
                toDecrypt,
                streamOffset,
              );
              processed += toDecrypt.length;
              buffer = new Uint8Array(remaining);
              controller.enqueue(decrypted);
            } catch (err) {
              controller.error(
                new Error(`Decrypt failed at offset ${streamOffset}: ${err}`),
              );
              return;
            }
          }
        },
        async flush(controller) {
          if (buffer.length > 0) {
            const streamOffset = startOffset + processed;
            try {
              const decrypted = await decryptChunk(
                cryptoKey,
                iv,
                buffer,
                streamOffset,
              );
              controller.enqueue(decrypted);
              buffer = new Uint8Array(0);
            } catch (err) {
              controller.error(
                new Error(`Decrypt failed at offset ${streamOffset}: ${err}`),
              );
            }
          }
        },
      },
      new CountQueuingStrategy({ highWaterMark: 4 }),
      new CountQueuingStrategy({ highWaterMark: 4 }),
    ),
  );
}

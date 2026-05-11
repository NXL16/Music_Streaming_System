type SongKey = {
  key: Uint8Array;
  iv: Uint8Array;
  cryptoKey: CryptoKey;
  expiresAt: number;
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 1024;
const keyCache = new Map<string, SongKey>();

function base64ToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(paddingLength);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function normalizeKmsUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

async function fetchSongKey(
  kmsUrl: string,
  songId: string,
): Promise<Omit<SongKey, "expiresAt">> {
  const url = `${normalizeKmsUrl(kmsUrl)}/key/${encodeURIComponent(songId)}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`KMS key fetch failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    encryptionKey?: string;
    iv?: string;
  };

  if (!payload.encryptionKey || !payload.iv) {
    throw new Error("KMS key payload missing");
  }

  const key = base64ToBytes(payload.encryptionKey);
  const iv = base64ToBytes(payload.iv);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "AES-CTR" },
    false,
    ["decrypt"],
  );

  return { key, iv, cryptoKey };
}

export async function getSongKey(
  kmsUrl: string,
  songId: string,
): Promise<SongKey> {
  const cached = keyCache.get(songId);
  if (cached && cached.expiresAt > Date.now()) return cached;
  if (cached) keyCache.delete(songId);

  const fetched = await fetchSongKey(kmsUrl, songId);
  const entry: SongKey = {
    ...fetched,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  keyCache.set(songId, entry);

  while (keyCache.size > CACHE_MAX_ENTRIES) {
    const oldestKey = keyCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    keyCache.delete(oldestKey);
  }

  return entry;
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
  if (iv.byteLength !== 16) {
    throw new Error("Invalid IV length");
  }

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

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      async transform(chunk, controller) {
        const streamOffset = startOffset + processed;
        const decrypted = await decryptChunk(
          cryptoKey,
          iv,
          chunk,
          streamOffset,
        );
        processed += chunk.length;
        controller.enqueue(decrypted);
      },
    }),
  );
}

export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function importAesKey(keyHex: string): Promise<CryptoKey> {
  const keyBytes = hexToBytes(keyHex);
  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-CTR" },
    false,
    ["decrypt"],
  );
}

export function incrementBigEndian128(
  iv: Uint8Array,
  increment: number,
): Uint8Array<ArrayBuffer> {
  const counter = new Uint8Array(16);
  counter.set(iv);

  let carry = increment;
  for (let i = 15; i >= 0 && carry > 0; i--) {
    const sum = counter[i] + (carry & 0xff);
    counter[i] = sum & 0xff;
    carry = (carry >>> 8) + (sum >>> 8);
  }

  return counter;
}

export async function decryptChunk(
  cryptoKey: CryptoKey,
  ivBytes: Uint8Array,
  ciphertext: ArrayBuffer,
  byteOffset: number,
): Promise<ArrayBuffer> {
  const blockIndex = Math.floor(byteOffset / 16);
  const blockOffset = byteOffset % 16;
  const counter = incrementBigEndian128(ivBytes, blockIndex);

  if (blockOffset === 0) {
    return crypto.subtle.decrypt(
      { name: "AES-CTR", counter: counter.buffer, length: 128 },
      cryptoKey,
      ciphertext,
    );
  }

  const padded = new Uint8Array(blockOffset + ciphertext.byteLength);
  padded.set(new Uint8Array(ciphertext), blockOffset);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-CTR", counter: counter.buffer, length: 128 },
    cryptoKey,
    padded,
  );

  return decrypted.slice(blockOffset);
}

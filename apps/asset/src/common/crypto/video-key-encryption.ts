import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const MASTER_KEY_HEX_PATTERN = /^[0-9a-f]{64}$/i;
const HLS_KEY_LENGTH = 16;
const GCM_IV_LENGTH = 12;

export type EncryptedVideoKey = {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  authTag: Uint8Array;
};

export function parseVideoKeyEncryptionKey(
  value: string | undefined,
): Buffer | undefined {
  const normalized = value?.trim() ?? "";
  return MASTER_KEY_HEX_PATTERN.test(normalized)
    ? Buffer.from(normalized, "hex")
    : undefined;
}

export function encryptVideoKey(
  keyEncryptionKey: Buffer,
  plaintextKey: Buffer,
): EncryptedVideoKey {
  if (plaintextKey.length !== HLS_KEY_LENGTH) {
    throw new Error("MUSIC_VIDEO_KEY_INVALID");
  }
  const iv = randomBytes(GCM_IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", keyEncryptionKey, iv);
  return {
    ciphertext: Buffer.concat([cipher.update(plaintextKey), cipher.final()]),
    iv,
    authTag: cipher.getAuthTag(),
  };
}

export function decryptVideoKey(
  keyEncryptionKey: Buffer,
  encrypted: EncryptedVideoKey,
): Buffer {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    keyEncryptionKey,
    Buffer.from(encrypted.iv),
  );
  decipher.setAuthTag(Buffer.from(encrypted.authTag));
  const plaintextKey = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext)),
    decipher.final(),
  ]);
  if (plaintextKey.length !== HLS_KEY_LENGTH) {
    throw new Error("MUSIC_VIDEO_KEY_INVALID");
  }
  return plaintextKey;
}

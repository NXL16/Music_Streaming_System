import { Prisma } from '../generated/prisma/client';

export interface AssetProcessingResult {
  publicUrl: string;
  width: number;
  height: number;
  durationMillis: number;
  variants: Prisma.InputJsonObject;
  /** Present only for MUSIC_VIDEO. The plaintext HLS key is never persisted. */
  videoEncryption?: {
    ciphertext: Buffer;
    iv: Buffer;
    authTag: Buffer;
  };
}

export interface MediaRendition {
  objectKey: string;
  url: string;
  contentType: string;
  width: number;
  height: number;
  sizeBytes: number;
}

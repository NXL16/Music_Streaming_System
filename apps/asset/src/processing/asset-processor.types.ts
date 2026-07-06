import { Prisma } from '../generated/prisma/client';

export interface AssetProcessingResult {
  publicUrl: string;
  width: number;
  height: number;
  durationMillis: number;
  variants: Prisma.InputJsonObject;
}

export interface MediaRendition {
  objectKey: string;
  url: string;
  contentType: string;
  width: number;
  height: number;
  sizeBytes: number;
}

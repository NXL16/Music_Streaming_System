import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import sharp from 'sharp';
import {
  Asset,
  AssetKind,
  Prisma,
} from '../generated/prisma/client';
import { StorageService } from '../storage/storage.service';
import {
  AssetProcessingResult,
  MediaRendition,
} from './asset-processor.types';

const execFileAsync = promisify(execFile);
const ARTWORK_WIDTHS = [256, 512, 1024, 2048];
const PROCESS_TIMEOUT_MS = 30 * 60 * 1000;

interface ProbeResult {
  streams?: Array<{
    codec_type?: string;
    width?: number;
    height?: number;
  }>;
  format?: {
    duration?: string;
  };
}

@Injectable()
export class AssetProcessorService {
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;

  constructor(
    private readonly storage: StorageService,
    config: ConfigService,
  ) {
    this.ffmpegPath = config.get<string>('FFMPEG_PATH') || 'ffmpeg';
    this.ffprobePath = config.get<string>('FFPROBE_PATH') || 'ffprobe';
  }

  process(asset: Asset): Promise<AssetProcessingResult> {
    return asset.kind === AssetKind.IMAGE
      ? this.processArtwork(asset)
      : this.processVideo(asset);
  }

  private async processArtwork(asset: Asset): Promise<AssetProcessingResult> {
    const source = await this.storage.getBuffer(asset.sourceObjectKey);
    this.verifyChecksum(asset, this.bufferChecksum(source));
    const metadata = await sharp(source, {
      limitInputPixels: 100_000_000,
    })
      .rotate()
      .metadata();
    const rotatesDimensions =
      metadata.orientation !== undefined &&
      metadata.orientation >= 5 &&
      metadata.orientation <= 8;
    const width = rotatesDimensions
      ? (metadata.height ?? 0)
      : (metadata.width ?? 0);
    const height = rotatesDimensions
      ? (metadata.width ?? 0)
      : (metadata.height ?? 0);
    if (width <= 0 || height <= 0) {
      throw new Error('ARTWORK_DIMENSIONS_INVALID');
    }

    const maximumWidth = Math.min(width, ARTWORK_WIDTHS.at(-1) ?? width);
    const targetWidths = [
      ...new Set([
        ...ARTWORK_WIDTHS.filter((target) => target < maximumWidth),
        maximumWidth,
      ]),
    ];
    const renditions: MediaRendition[] = [];

    for (const targetWidth of targetWidths) {
      const { data, info } = await sharp(source, {
        limitInputPixels: 100_000_000,
      })
        .rotate()
        .resize({ width: targetWidth, withoutEnlargement: true })
        .webp({ quality: 84, effort: 5 })
        .toBuffer({ resolveWithObject: true });
      const objectKey = `processed/${asset.id}/artwork/${info.width}w.webp`;
      await this.storage.uploadBuffer(objectKey, data, 'image/webp');
      renditions.push({
        objectKey,
        url: this.storage.publicUrl(objectKey),
        contentType: 'image/webp',
        width: info.width,
        height: info.height,
        sizeBytes: data.length,
      });
    }

    const primary = renditions.at(-1);
    if (!primary) throw new Error('ARTWORK_RENDITION_MISSING');

    return {
      publicUrl: primary.url,
      width,
      height,
      durationMillis: 0,
      variants: this.json({
        original: { width, height, contentType: asset.contentType },
        renditions,
      }),
    };
  }

  private async processVideo(asset: Asset): Promise<AssetProcessingResult> {
    const workDirectory = await mkdtemp(join(tmpdir(), 'musical-asset-'));
    const sourceExtension = extname(asset.filename) || '.video';
    const sourcePath = join(workDirectory, `source${sourceExtension}`);
    const videoPath = join(workDirectory, 'video-720p.mp4');
    const posterPath = join(workDirectory, 'poster.jpg');

    try {
      await this.storage.downloadToFile(asset.sourceObjectKey, sourcePath);
      this.verifyChecksum(asset, await this.fileChecksum(sourcePath));
      const sourceProbe = await this.probe(sourcePath);
      const sourceVideo = sourceProbe.streams?.find(
        (stream) => stream.codec_type === 'video',
      );
      const sourceWidth = sourceVideo?.width ?? 0;
      const sourceHeight = sourceVideo?.height ?? 0;
      const durationSeconds = Number(sourceProbe.format?.duration ?? 0);
      if (
        sourceWidth <= 0 ||
        sourceHeight <= 0 ||
        !Number.isFinite(durationSeconds) ||
        durationSeconds <= 0
      ) {
        throw new Error('VIDEO_METADATA_INVALID');
      }

      await this.run(this.ffmpegPath, [
        '-y',
        '-i',
        sourcePath,
        '-map',
        '0:v:0',
        '-an',
        '-vf',
        "scale=w='min(1280,iw)':h=-2",
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        videoPath,
      ]);
      await this.run(this.ffmpegPath, [
        '-y',
        '-ss',
        String(Math.min(1, durationSeconds / 10)),
        '-i',
        sourcePath,
        '-frames:v',
        '1',
        '-vf',
        "scale=w='min(1280,iw)':h=-2",
        '-q:v',
        '2',
        posterPath,
      ]);

      const outputProbe = await this.probe(videoPath);
      const outputVideo = outputProbe.streams?.find(
        (stream) => stream.codec_type === 'video',
      );
      const outputWidth = outputVideo?.width ?? 0;
      const outputHeight = outputVideo?.height ?? 0;
      const videoObjectKey = `processed/${asset.id}/video/video-720p.mp4`;
      const posterObjectKey = `processed/${asset.id}/video/poster.jpg`;
      await this.storage.uploadFile(
        videoObjectKey,
        videoPath,
        'video/mp4',
      );
      await this.storage.uploadFile(
        posterObjectKey,
        posterPath,
        'image/jpeg',
      );
      const videoFile = await stat(videoPath);
      const posterFile = await stat(posterPath);
      const videoUrl = this.storage.publicUrl(videoObjectKey);

      return {
        publicUrl: videoUrl,
        width: sourceWidth,
        height: sourceHeight,
        durationMillis: Math.round(durationSeconds * 1000),
        variants: this.json({
          original: {
            width: sourceWidth,
            height: sourceHeight,
            durationMillis: Math.round(durationSeconds * 1000),
            contentType: asset.contentType,
          },
          renditions: [
            {
              objectKey: videoObjectKey,
              url: videoUrl,
              contentType: 'video/mp4',
              width: outputWidth,
              height: outputHeight,
              sizeBytes: videoFile.size,
            },
          ],
          poster: {
            objectKey: posterObjectKey,
            url: this.storage.publicUrl(posterObjectKey),
            contentType: 'image/jpeg',
            width: outputWidth,
            height: outputHeight,
            sizeBytes: posterFile.size,
          },
        }),
      };
    } finally {
      await rm(workDirectory, { recursive: true, force: true });
    }
  }

  private async probe(filePath: string): Promise<ProbeResult> {
    const { stdout } = await this.run(this.ffprobePath, [
      '-v',
      'error',
      '-show_streams',
      '-show_format',
      '-of',
      'json',
      filePath,
    ]);
    return JSON.parse(stdout) as ProbeResult;
  }

  private run(
    executable: string,
    args: string[],
  ): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync(executable, args, {
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      timeout: PROCESS_TIMEOUT_MS,
      windowsHide: true,
    });
  }

  private json(value: object): Prisma.InputJsonObject {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
  }

  private bufferChecksum(value: Buffer): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private async fileChecksum(filePath: string): Promise<string> {
    const hash = createHash('sha256');
    await pipeline(createReadStream(filePath), hash);
    return hash.digest('hex');
  }

  private verifyChecksum(asset: Asset, checksum: string): void {
    if (checksum !== asset.checksum) {
      throw new Error('ASSET_CHECKSUM_MISMATCH');
    }
  }
}

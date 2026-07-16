import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
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

// Renditions are aligned with the application's actual artwork consumers:
// player bar (40/80), regular cards (296/316/592/632), and hero cards
// (450/600/900/1200). Each source image is only rendered up to its own width.
const NORMAL_ARTWORK_WIDTHS = [40, 80, 296, 316, 592, 632];
const HERO_ARTWORK_WIDTHS = [450, 600, 900, 1200];
const HERO_ASPECT_RATIO = 3 / 4;
// The extension overlaps the original artwork and fades in gradually. This
// avoids a visible horizontal seam on bright artwork.
const HERO_BOTTOM_STRIP_HEIGHT = 72;
const HERO_BLEND_OVERLAP_HEIGHT = 46;
const HERO_EXTENSION_BLUR_SIGMA = 34;
const HERO_TEXT_REGION_START = 0.62;
const HERO_TEXT_CONTRAST_PERCENTILE = 0.15;
const MINIMUM_TEXT_CONTRAST = 4.5;
const PROCESS_TIMEOUT_MS = 30 * 60 * 1000;

interface ArtworkPalette {
  bgColor: string;
  textColor1: string;
  textColor2: string;
  textColor3: string;
  textColor4: string;
  hasP3: boolean;
}

interface HeroTextPalette {
  textColor1: string;
  textColor2: string;
  scrimColor?: string;
  scrimOpacity?: number;
}

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
export class AssetProcessorService implements OnModuleDestroy {
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;
  private activeChild?: ChildProcess;

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
    const normalizedSource = await sharp(source, {
      limitInputPixels: 100_000_000,
    })
      .rotate()
      .toBuffer();
    const metadata = await sharp(normalizedSource).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width <= 0 || height <= 0) {
      throw new Error('ARTWORK_DIMENSIONS_INVALID');
    }
    const palette = await this.artworkPalette(normalizedSource);

    const normalMaximumWidth = Math.min(
      width,
      NORMAL_ARTWORK_WIDTHS.at(-1) ?? width,
    );
    const normalTargetWidths = [
      ...new Set([
        ...NORMAL_ARTWORK_WIDTHS.filter(
          (target) => target < normalMaximumWidth,
        ),
        normalMaximumWidth,
      ]),
    ];
    const renditions: MediaRendition[] = [];

    const results = await Promise.all(
      normalTargetWidths.map(async (targetWidth) => {
        const { data, info } = await sharp(normalizedSource)
          .resize({ width: targetWidth, withoutEnlargement: true })
          .webp({ quality: 84, effort: 5 })
          .toBuffer({ resolveWithObject: true });
        const objectKey = `processed/${asset.id}/artwork/${info.width}w.webp`;
        await this.storage.uploadBuffer(objectKey, data, 'image/webp');
        return {
          objectKey,
          url: this.storage.publicUrl(objectKey),
          contentType: 'image/webp' as const,
          width: info.width,
          height: info.height,
          sizeBytes: data.length,
        };
      }),
    );
    renditions.push(...results);

    const heroHeight = Math.ceil(width / HERO_ASPECT_RATIO);
    const extendHeight = Math.max(0, heroHeight - height);
    const heroSource =
      extendHeight === 0
        ? await sharp(normalizedSource)
            .resize({
              width,
              height: heroHeight,
              fit: 'cover',
              position: 'centre',
            })
            .toBuffer()
        : await this.createHeroArtworkSource(
            normalizedSource,
            width,
            height,
            heroHeight,
            extendHeight,
          );
    const heroPalette = await this.heroTextPalette(heroSource);
    const heroMaximumWidth = Math.min(
      width,
      HERO_ARTWORK_WIDTHS.at(-1) ?? width,
    );
    const heroTargetWidths = [
      ...new Set([
        ...HERO_ARTWORK_WIDTHS.filter((target) => target < heroMaximumWidth),
        heroMaximumWidth,
      ]),
    ];
    const heroRenditions = await Promise.all(
      heroTargetWidths.map(async (targetWidth) => {
        const { data, info } = await sharp(heroSource)
          .resize({ width: targetWidth, withoutEnlargement: true })
          .webp({ quality: 84, effort: 5 })
          .toBuffer({ resolveWithObject: true });
        const objectKey = `processed/${asset.id}/artwork/hero/${info.width}w.webp`;
        await this.storage.uploadBuffer(objectKey, data, 'image/webp');
        return {
          objectKey,
          url: this.storage.publicUrl(objectKey),
          contentType: 'image/webp' as const,
          width: info.width,
          height: info.height,
          sizeBytes: data.length,
        };
      }),
    );

    const primary = renditions.at(-1);
    if (!primary) throw new Error('ARTWORK_RENDITION_MISSING');

    return {
      publicUrl: primary.url,
      width,
      height,
      durationMillis: 0,
      variants: this.json({
        original: { width, height, contentType: asset.contentType },
        palette,
        renditions,
        hero: {
          width,
          height: heroHeight,
          palette: heroPalette,
          renditions: heroRenditions,
        },
      }),
    };
  }

  private async createHeroArtworkSource(
    normalizedSource: Buffer,
    width: number,
    height: number,
    heroHeight: number,
    extendHeight: number,
  ): Promise<Buffer> {
    const stripHeight = Math.min(HERO_BOTTOM_STRIP_HEIGHT, height);
    const blendHeight = Math.min(HERO_BLEND_OVERLAP_HEIGHT, height);
    const extensionHeight = extendHeight + blendHeight;
    const blurredExtension = await sharp(normalizedSource)
      .extract({ left: 0, top: height - stripHeight, width, height: stripHeight })
      .resize({ width, height: extensionHeight, fit: 'fill' })
      .blur(HERO_EXTENSION_BLUR_SIGMA)
      .toBuffer();
    const featheredExtension = await sharp(blurredExtension)
      .removeAlpha()
      .joinChannel(this.heroFadeMask(width, extensionHeight, blendHeight), {
        raw: { width, height: extensionHeight, channels: 1 },
      })
      .png()
      .toBuffer();

    return sharp({
      create: {
        width,
        height: heroHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    })
      .composite([
        { input: normalizedSource, top: 0, left: 0 },
        // Composite the blurred background over the lower edge of the source.
        // Its alpha goes from 0 to 1 across this overlap, yielding a soft,
        // painterly transition instead of a hard cut.
        { input: featheredExtension, top: height - blendHeight, left: 0 },
      ])
      .png()
      .toBuffer();
  }

  private heroFadeMask(
    width: number,
    height: number,
    fadeHeight: number,
  ): Buffer {
    const alpha = Buffer.alloc(width * height);
    for (let row = 0; row < height; row += 1) {
      const progress = Math.min(1, row / Math.max(1, fadeHeight));
      // Smoothstep avoids a perceptible change in opacity at either edge.
      const opacity = progress * progress * (3 - 2 * progress);
      alpha.fill(Math.round(opacity * 255), row * width, (row + 1) * width);
    }
    return alpha;
  }

  private async artworkPalette(source: Buffer): Promise<ArtworkPalette> {
    const dominant = (await sharp(source).stats()).dominant;
    const background = {
      r: dominant.r,
      g: dominant.g,
      b: dominant.b,
    };
    const luminance =
      (0.2126 * background.r + 0.7152 * background.g + 0.0722 * background.b) /
      255;
    const foreground = luminance > 0.52
      ? { r: 0, g: 0, b: 0 }
      : { r: 255, g: 255, b: 255 };
    const textColor = (opacity: number) =>
      this.hexColor({
        r: Math.round(background.r * (1 - opacity) + foreground.r * opacity),
        g: Math.round(background.g * (1 - opacity) + foreground.g * opacity),
        b: Math.round(background.b * (1 - opacity) + foreground.b * opacity),
      });

    return {
      bgColor: this.hexColor(background),
      textColor1: textColor(1),
      textColor2: textColor(0.82),
      textColor3: textColor(0.64),
      textColor4: textColor(0.46),
      hasP3: false,
    };
  }

  /**
   * Hero metadata always sits at the bottom, so a whole-image dominant color
   * is not reliable enough. Analyse the final hero artwork's lower area and
   * choose the text colour with the strongest lower-percentile WCAG contrast.
   * A directional scrim is emitted only for mixed backgrounds where neither
   * black nor white can keep the target contrast across that area.
   */
  private async heroTextPalette(source: Buffer): Promise<HeroTextPalette> {
    const metadata = await sharp(source).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width <= 0 || height <= 0) {
      return { textColor1: 'ffffff', textColor2: 'ffffff' };
    }

    const top = Math.min(height - 1, Math.floor(height * HERO_TEXT_REGION_START));
    const { data, info } = await sharp(source)
      .extract({ left: 0, top, width, height: height - top })
      .removeAlpha()
      .resize({ width: 96, height: 96, fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const luminances: number[] = [];
    for (let offset = 0; offset < data.length; offset += info.channels) {
      const red = data[offset] ?? 0;
      const green = data[offset + 1] ?? 0;
      const blue = data[offset + 2] ?? 0;
      luminances.push(this.relativeLuminance(red, green, blue));
    }
    luminances.sort((left, right) => left - right);

    const darkest = this.percentile(luminances, HERO_TEXT_CONTRAST_PERCENTILE);
    const brightest = this.percentile(
      luminances,
      1 - HERO_TEXT_CONTRAST_PERCENTILE,
    );
    const blackContrast = (darkest + 0.05) / 0.05;
    const whiteContrast = 1.05 / (brightest + 0.05);
    const useBlackText = blackContrast >= whiteContrast;
    const contrast = useBlackText ? blackContrast : whiteContrast;

    if (contrast >= MINIMUM_TEXT_CONTRAST) {
      const color = useBlackText ? '000000' : 'ffffff';
      return { textColor1: color, textColor2: color };
    }

    const targetLuminance = useBlackText ? 0.175 : 1 / 4.5 - 0.05;
    const baseLuminance = useBlackText ? darkest : brightest;
    const requiredOpacity = useBlackText
      ? (targetLuminance - baseLuminance) / Math.max(0.001, 1 - baseLuminance)
      : 1 - targetLuminance / Math.max(0.001, baseLuminance);
    const color = useBlackText ? '000000' : 'ffffff';

    return {
      textColor1: color,
      textColor2: color,
      scrimColor: useBlackText ? 'ffffff' : '000000',
      scrimOpacity: Math.max(0.18, Math.min(0.72, requiredOpacity + 0.06)),
    };
  }

  private relativeLuminance(red: number, green: number, blue: number) {
    const linear = (channel: number) => {
      const value = channel / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    };

    return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
  }

  private percentile(values: number[], percentile: number) {
    if (!values.length) return 0;
    const index = Math.min(
      values.length - 1,
      Math.max(0, Math.floor((values.length - 1) * percentile)),
    );
    return values[index] ?? 0;
  }

  private hexColor(color: { r: number; g: number; b: number }): string {
    return [color.r, color.g, color.b]
      .map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0'))
      .join('');
  }

  private async processVideo(asset: Asset): Promise<AssetProcessingResult> {
    const workDirectory = await mkdtemp(join(tmpdir(), 'musical-asset-'));
    const sourceExtension = extname(asset.filename) || '.video';
    const sourcePath = join(workDirectory, `source${sourceExtension}`);
    const rawPosterPath = join(workDirectory, 'poster-raw.png');
    const poster2400Path = join(workDirectory, 'poster-2400w.webp');
    const poster1200Path = join(workDirectory, 'poster-1200w.webp');

    const TARGET_RESOLUTIONS = [
      { name: '720p', width: 1280, bitrate: '2800k', bandwidth: 2800000 },
      { name: '1080p', width: 1920, bitrate: '5000k', bandwidth: 5000000 },
      { name: '1440p', width: 2560, bitrate: '9000k', bandwidth: 9000000 },
      { name: '2160p', width: 3840, bitrate: '14000k', bandwidth: 14000000 },
    ];

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

      // Filter resolutions to only target widths <= sourceWidth
      const activeResolutions = TARGET_RESOLUTIONS.filter(
        (res) => res.width <= sourceWidth,
      );
      if (activeResolutions.length === 0) {
        activeResolutions.push(TARGET_RESOLUTIONS[0]);
      }

      // Dynamically calculate segment durations:
      // First segment is 1 second (hls_init_time) for instant startup/playback.
      // The remaining duration is split into approximately 6 segments.
      const hlsInitTime = 1;
      const hlsTime = Math.max(1.5, Math.round(((durationSeconds - hlsInitTime) / 6) * 10) / 10);

      // Transcode each resolution
      for (const res of activeResolutions) {
        const playlistPath = join(workDirectory, `video-${res.name}.m3u8`);
        const segmentPattern = join(workDirectory, `segment-${res.name}_%03d.ts`);

        await this.run(this.ffmpegPath, [
          '-y',
          '-i',
          sourcePath,
          '-map',
          '0:v:0',
          '-an',
          '-vf',
          `scale=w='min(${res.width},iw)':h=-2`,
          '-c:v',
          'libx264',
          '-preset',
          'medium',
          '-crf',
          '23',
          '-b:v',
          res.bitrate,
          '-maxrate',
          res.bitrate,
          '-bufsize',
          `${parseInt(res.bitrate) * 2}k`,
          '-pix_fmt',
          'yuv420p',
          '-g',
          '60',
          '-hls_init_time',
          String(hlsInitTime),
          '-hls_time',
          String(hlsTime),
          '-hls_playlist_type',
          'vod',
          '-hls_segment_filename',
          segmentPattern,
          playlistPath,
        ]);
      }

      // Extract raw poster frame
      await this.run(this.ffmpegPath, [
        '-y',
        '-ss',
        String(Math.min(1, durationSeconds / 10)),
        '-i',
        sourcePath,
        '-frames:v',
        '1',
        rawPosterPath,
      ]);

      // Generate 2400w and 1200w WebP poster images using sharp
      await sharp(rawPosterPath)
        .resize(2400, 1350, { fit: 'cover' })
        .webp({ quality: 85 })
        .toFile(poster2400Path);

      await sharp(rawPosterPath)
        .resize(1200, 675, { fit: 'cover' })
        .webp({ quality: 85 })
        .toFile(poster1200Path);

      // Write master default.m3u8 playlist file
      let masterPlaylistContent = '#EXTM3U\n#EXT-X-VERSION:3\n';
      const parsedRenditions: Array<{
        name: string;
        width: number;
        height: number;
        playlistFile: string;
      }> = [];

      for (const res of activeResolutions) {
        const subPlaylistName = `video-${res.name}.m3u8`;

        // Find actual resolution of transcoded segments
        const allFiles = await readdir(workDirectory);
        const resSegments = allFiles.filter(
          (f) => f.startsWith(`segment-${res.name}_`) && f.endsWith('.ts'),
        );
        let actualWidth = res.width;
        let actualHeight = Math.round((res.width * sourceHeight) / sourceWidth);

        if (resSegments[0]) {
          try {
            const probeResult = await this.probe(join(workDirectory, resSegments[0]));
            const videoStream = probeResult.streams?.find(
              (stream) => stream.codec_type === 'video',
            );
            if (videoStream?.width && videoStream?.height) {
              actualWidth = videoStream.width;
              actualHeight = videoStream.height;
            }
          } catch {
            // keep default calculation
          }
        }

        masterPlaylistContent += `#EXT-X-STREAM-INF:BANDWIDTH=${res.bandwidth},RESOLUTION=${actualWidth}x${actualHeight}\n`;
        masterPlaylistContent += `${subPlaylistName}\n`;

        parsedRenditions.push({
          name: res.name,
          width: actualWidth,
          height: actualHeight,
          playlistFile: subPlaylistName,
        });
      }

      const masterPlaylistPath = join(workDirectory, 'default.m3u8');
      await writeFile(masterPlaylistPath, masterPlaylistContent, 'utf8');

      // Upload all segments, sub-playlists, master playlist and WebP poster variants to S3/R2 storage
      const finalFiles = await readdir(workDirectory);
      await Promise.all(
        finalFiles.map(async (file) => {
          const filePath = join(workDirectory, file);
          const objectKey = `processed/${asset.id}/video/${file}`;

          if (file.endsWith('.ts')) {
            await this.storage.uploadFile(objectKey, filePath, 'video/MP2T');
          } else if (file.endsWith('.m3u8')) {
            await this.storage.uploadFile(objectKey, filePath, 'application/x-mpegURL');
          } else if (file === 'poster-2400w.webp' || file === 'poster-1200w.webp') {
            await this.storage.uploadFile(objectKey, filePath, 'image/webp');
          }
        }),
      );

      const masterPlaylistObjectKey = `processed/${asset.id}/video/default.m3u8`;
      const poster2400ObjectKey = `processed/${asset.id}/video/poster-2400w.webp`;
      const poster1200ObjectKey = `processed/${asset.id}/video/poster-1200w.webp`;

      const masterFileStats = await stat(masterPlaylistPath);
      const poster2400FileStats = await stat(poster2400Path);
      const poster1200FileStats = await stat(poster1200Path);
      const masterPlaylistUrl = this.storage.publicUrl(masterPlaylistObjectKey);

      const renditions = [
        {
          objectKey: masterPlaylistObjectKey,
          url: masterPlaylistUrl,
          contentType: 'application/x-mpegURL',
          width: sourceWidth,
          height: sourceHeight,
          sizeBytes: masterFileStats.size,
        },
        ...parsedRenditions.map((item) => ({
          objectKey: `processed/${asset.id}/video/${item.playlistFile}`,
          url: this.storage.publicUrl(`processed/${asset.id}/video/${item.playlistFile}`),
          contentType: 'application/x-mpegURL',
          width: item.width,
          height: item.height,
          sizeBytes: 0,
        })),
      ];

      return {
        publicUrl: masterPlaylistUrl,
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
          renditions,
          poster: {
            objectKey: poster2400ObjectKey,
            url: this.storage.publicUrl(poster2400ObjectKey),
            contentType: 'image/webp',
            width: 2400,
            height: 1350,
            sizeBytes: poster2400FileStats.size,
            variants: {
              renditions: [
                {
                  objectKey: poster1200ObjectKey,
                  url: this.storage.publicUrl(poster1200ObjectKey),
                  contentType: 'image/webp',
                  width: 1200,
                  height: 675,
                  sizeBytes: poster1200FileStats.size,
                },
                {
                  objectKey: poster2400ObjectKey,
                  url: this.storage.publicUrl(poster2400ObjectKey),
                  contentType: 'image/webp',
                  width: 2400,
                  height: 1350,
                  sizeBytes: poster2400FileStats.size,
                },
              ],
            },
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
    return new Promise((resolve, reject) => {
      const child = execFile(
        executable,
        args,
        {
          encoding: 'utf8',
          maxBuffer: 4 * 1024 * 1024,
          timeout: PROCESS_TIMEOUT_MS,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          this.activeChild = undefined;
          if (error) {
            reject(error);
            return;
          }
          resolve({ stdout, stderr });
        },
      );
      this.activeChild = child;
    });
  }

  onModuleDestroy(): void {
    this.abort();
  }

  abort(): void {
    this.activeChild?.kill('SIGTERM');
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

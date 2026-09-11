import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { execFile, type ChildProcess } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import sharp from "sharp";
import { Asset, AssetKind, AssetPurpose, Prisma } from "../generated/prisma/client";
import { StorageService } from "../storage/storage.service";
import {
  encryptVideoKey,
  parseVideoKeyEncryptionKey,
} from "../common/crypto/video-key-encryption";
import { AssetProcessingResult, MediaRendition } from "./asset-processor.types";

const NORMAL_ARTWORK_WIDTHS = [40, 80, 296, 316, 592, 632];
const STATION_ARTWORK_WIDTHS = [296, 316, 592, 632];
const AVATAR_SIZES = [40, 80, 256];
const AVATAR_MAX_INPUT_PIXELS = 25_000_000;
const DEFAULT_ARTWORK_MAX_INPUT_PIXELS = 30_000_000;
const DEFAULT_IMAGE_RENDITION_CONCURRENCY = 2;
const DEFAULT_VIDEO_UPLOAD_CONCURRENCY = 4;
const DEFAULT_VIDEO_HLS_SEGMENT_DURATION_SECONDS = 3;
const HERO_ARTWORK_WIDTHS = [450, 600, 900, 1200];
const HERO_ASPECT_RATIO = 3 / 4;
const HERO_EXTENSION_STRIP = 48;
const HERO_EXTENSION_BLUR_SIGMA = 28;
const HERO_DARK_EDGE_MIN_LUMINANCE = 10;
const HERO_DARK_EDGE_MEAN_LUMINANCE = 35;
const HERO_TEXT_REGION_START = 0.78;
const HERO_TEXT_CONTRAST_PERCENTILE = 0.1;
const MINIMUM_TEXT_CONTRAST = 4.5;
const HERO_TEXT_PRIMARY = "ffffff";
const HERO_TEXT_SECONDARY = "ebebf5";
const HERO_TEXT_TERTIARY = "c7c7cc";
const HERO_TEXT_QUATERNARY = "8e8e93";
const HERO_DARK_TEXT_PRIMARY = "000000";
const HERO_DARK_TEXT_SECONDARY = "3a3a3c";
const HERO_DARK_TEXT_TERTIARY = "636366";
const PROCESS_TIMEOUT_MS = 30 * 60 * 1000;
const PERCEPTUAL_HASH_WIDTH = 9;
const PERCEPTUAL_HASH_HEIGHT = 8;

interface ArtworkPalette {
  bgColor: string;
  textColor1: string;
  textColor2: string;
  textColor3: string;
  textColor4: string;
  hasP3: boolean;
}

interface HeroTextPalette {
  bgColor: string;
  textColor1: string;
  textColor2: string;
  textColor3: string;
  textColor4: string;
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
  private readonly artworkMaxInputPixels: number;
  private readonly imageRenditionConcurrency: number;
  private readonly videoUploadConcurrency: number;
  private readonly videoHlsSegmentDurationSeconds: number;
  private readonly videoKeyUriBase: string;
  private readonly videoKeyEncryptionKey: Buffer | undefined;
  private activeChild?: ChildProcess;

  constructor(
    private readonly storage: StorageService,
    config: ConfigService,
  ) {
    this.ffmpegPath = config.get<string>("FFMPEG_PATH") || "ffmpeg";
    this.ffprobePath = config.get<string>("FFPROBE_PATH") || "ffprobe";
    this.artworkMaxInputPixels = this.positiveInteger(
      config.get<string>("ASSET_ARTWORK_MAX_INPUT_PIXELS"),
      DEFAULT_ARTWORK_MAX_INPUT_PIXELS,
    );
    this.imageRenditionConcurrency = this.positiveInteger(
      config.get<string>("ASSET_IMAGE_RENDITION_CONCURRENCY"),
      DEFAULT_IMAGE_RENDITION_CONCURRENCY,
    );
    this.videoUploadConcurrency = this.positiveInteger(
      config.get<string>("ASSET_VIDEO_UPLOAD_CONCURRENCY"),
      DEFAULT_VIDEO_UPLOAD_CONCURRENCY,
    );
    this.videoHlsSegmentDurationSeconds = this.positiveInteger(
      config.get<string>("ASSET_VIDEO_HLS_SEGMENT_DURATION_SECONDS"),
      DEFAULT_VIDEO_HLS_SEGMENT_DURATION_SECONDS,
    );
    this.videoKeyUriBase =
      config.get<string>("ASSET_VIDEO_KEY_URI_BASE")?.replace(/\/+$/, "") ??
      "";
    this.videoKeyEncryptionKey = parseVideoKeyEncryptionKey(
      config.get<string>("ASSET_VIDEO_KEY_ENCRYPTION_KEY"),
    );
  }

  process(asset: Asset): Promise<AssetProcessingResult> {
    if (asset.kind === AssetKind.IMAGE) {
      if (asset.purpose === AssetPurpose.PROFILE_AVATAR) {
        return this.processAvatar(asset);
      }
      if (asset.purpose === AssetPurpose.STATION_ARTWORK) {
        return this.processStationArtwork(asset);
      }
      return this.processArtwork(asset);
    }
    return this.processVideo(asset);
  }

  private async processAvatar(asset: Asset): Promise<AssetProcessingResult> {
    const source = await this.storage.getBuffer(asset.sourceObjectKey);
    this.verifyChecksum(asset, this.bufferChecksum(source));
    const normalizedSource = await sharp(source, {
      limitInputPixels: AVATAR_MAX_INPUT_PIXELS,
    })
      .rotate()
      .toBuffer();
    const metadata = await sharp(normalizedSource).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width <= 0 || height <= 0) {
      throw new Error("AVATAR_DIMENSIONS_INVALID");
    }

    const renditions = await this.mapWithConcurrency(
      AVATAR_SIZES,
      this.imageRenditionConcurrency,
      async (size) => {
        const { data, info } = await sharp(normalizedSource)
          .resize({
            width: size,
            height: size,
            fit: "cover",
            position: "centre",
            withoutEnlargement: true,
          })
          .webp({ quality: 84, effort: 5 })
          .toBuffer({ resolveWithObject: true });
        const objectKey = `processed/${asset.id}/avatar/${info.width}w.webp`;
        await this.storage.uploadBuffer(objectKey, data, "image/webp");
        return {
          objectKey,
          url: this.storage.publicUrl(objectKey),
          contentType: "image/webp" as const,
          width: info.width,
          height: info.height,
          sizeBytes: data.length,
        };
      },
    );
    const primary = renditions.at(-1);
    if (!primary) throw new Error("AVATAR_RENDITION_MISSING");

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

  /**
   * Song Station covers are only rendered in square card layouts. Keeping
   * this separate from catalog artwork avoids generating hero artwork and
   * small icon renditions that the Station UI never requests.
   */
  private async processStationArtwork(
    asset: Asset,
  ): Promise<AssetProcessingResult> {
    const source = await this.storage.getBuffer(asset.sourceObjectKey);
    this.verifyChecksum(asset, this.bufferChecksum(source));
    const normalizedSource = await sharp(source, {
      limitInputPixels: this.artworkMaxInputPixels,
    })
      .rotate()
      .toBuffer();
    const metadata = await sharp(normalizedSource).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width <= 0 || height <= 0) {
      throw new Error("STATION_ARTWORK_DIMENSIONS_INVALID");
    }

    const renditions = await this.mapWithConcurrency(
      STATION_ARTWORK_WIDTHS.filter((target) => target <= width),
      this.imageRenditionConcurrency,
      async (targetWidth) => {
        const { data, info } = await sharp(normalizedSource)
          .resize({ width: targetWidth, withoutEnlargement: true })
          .webp({ quality: 86, effort: 4, smartSubsample: true })
          .toBuffer({ resolveWithObject: true });
        const objectKey = `processed/${asset.id}/station-artwork/${info.width}w.webp`;
        await this.storage.uploadBuffer(objectKey, data, "image/webp");
        return {
          objectKey,
          url: this.storage.publicUrl(objectKey),
          contentType: "image/webp" as const,
          width: info.width,
          height: info.height,
          sizeBytes: data.length,
        };
      },
    );
    const primary = renditions.at(-1);
    if (!primary) throw new Error("STATION_ARTWORK_RENDITION_MISSING");

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

  private async processArtwork(asset: Asset): Promise<AssetProcessingResult> {
    const source = await this.storage.getBuffer(asset.sourceObjectKey);
    this.verifyChecksum(asset, this.bufferChecksum(source));
    const normalizedSource = await sharp(source, {
      limitInputPixels: this.artworkMaxInputPixels,
    })
      .rotate()
      .toBuffer();
    const metadata = await sharp(normalizedSource).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width <= 0 || height <= 0) {
      throw new Error("ARTWORK_DIMENSIONS_INVALID");
    }
    const palette = await this.artworkPalette(normalizedSource);
    const perceptualHash = await this.perceptualHash(normalizedSource);

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

    const results = await this.mapWithConcurrency(
      normalTargetWidths,
      this.imageRenditionConcurrency,
      async (targetWidth) => {
        const { data, info } = await sharp(normalizedSource)
          .resize({ width: targetWidth, withoutEnlargement: true })
          .webp({ quality: 84, effort: 5 })
          .toBuffer({ resolveWithObject: true });
        const objectKey = `processed/${asset.id}/artwork/${info.width}w.webp`;
        await this.storage.uploadBuffer(objectKey, data, "image/webp");
        return {
          objectKey,
          url: this.storage.publicUrl(objectKey),
          contentType: "image/webp" as const,
          width: info.width,
          height: info.height,
          sizeBytes: data.length,
        };
      },
    );
    renditions.push(...results);

    const heroHeight = Math.ceil(width / HERO_ASPECT_RATIO);
    // Extra height the 3:4 hero needs beyond the (fully preserved) source. When
    // the source is already tall enough there is nothing to synthesise, so we
    // just cover-resize down to the target frame.
    const extensionHeight = Math.max(0, heroHeight - height);
    const heroSource =
      extensionHeight === 0
        ? await sharp(normalizedSource)
            .resize({
              width,
              height: heroHeight,
              fit: "cover",
              position: "centre",
            })
            .toBuffer()
        : await this.createHeroArtworkSource(
            normalizedSource,
            width,
            height,
            heroHeight,
            extensionHeight,
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
    const heroRenditions = await this.mapWithConcurrency(
      heroTargetWidths,
      this.imageRenditionConcurrency,
      async (targetWidth) => {
        const { data, info } = await sharp(heroSource)
          .resize({ width: targetWidth, withoutEnlargement: true })
          .webp({ quality: 84, effort: 5, smartSubsample: true })
          .toBuffer({ resolveWithObject: true });
        const objectKey = `processed/${asset.id}/artwork/hero/${info.width}w.webp`;
        await this.storage.uploadBuffer(objectKey, data, "image/webp");
        return {
          objectKey,
          url: this.storage.publicUrl(objectKey),
          contentType: "image/webp" as const,
          width: info.width,
          height: info.height,
          sizeBytes: data.length,
        };
      },
    );

    const primary = renditions.at(-1);
    if (!primary) throw new Error("ARTWORK_RENDITION_MISSING");

    return {
      publicUrl: primary.url,
      width,
      height,
      durationMillis: 0,
      variants: this.json({
        original: { width, height, contentType: asset.contentType },
        palette,
        perceptualHash,
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
    extensionHeight: number,
  ): Promise<Buffer> {
    const stripHeight = Math.min(HERO_EXTENSION_STRIP, height);
    const { buffer: extension, overlap } = await this.buildHeroExtension(
      normalizedSource,
      width,
      height,
      extensionHeight,
      stripHeight,
    );

    return sharp({
      create: {
        width,
        height: heroHeight,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .composite([
        { input: normalizedSource, top: 0, left: 0 },
        { input: extension, top: height - overlap, left: 0 },
      ])
      .png()
      .toBuffer();
  }

  private async buildHeroExtension(
    source: Buffer,
    width: number,
    height: number,
    extensionHeight: number,
    stripHeight: number,
  ): Promise<{ buffer: Buffer; overlap: number }> {
    // Sample the bottom rows of the source to detect a dark/black edge.
    const edgeHeight = Math.min(6, height);
    const edgeStats = await sharp(source)
      .extract({ left: 0, top: height - edgeHeight, width, height: edgeHeight })
      .stats();

    const [rMean, gMean, bMean] = edgeStats.channels.map((channel) =>
      Math.round(channel.mean),
    );
    const [rMin, gMin, bMin] = edgeStats.channels.map((channel) => channel.min);

    const minLuminance = 0.299 * rMin + 0.587 * gMin + 0.114 * bMin;
    const meanLuminance = 0.299 * rMean + 0.587 * gMean + 0.114 * bMean;

    // BRANCH 1: near-black bottom edge. Build a pure black block directly rather
    // than stretching a razor-thin slice, which would smear grey/colour over any
    // text. overlap = 0 so the fill starts right below the source's last row.
    if (
      minLuminance < HERO_DARK_EDGE_MIN_LUMINANCE &&
      meanLuminance < HERO_DARK_EDGE_MEAN_LUMINANCE
    ) {
      const blackExtension = await sharp({
        create: {
          width,
          height: extensionHeight,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 1 },
        },
      })
        .png()
        .toBuffer();
      return { buffer: blackExtension, overlap: 0 };
    }

    // BRANCH 2: coloured/complex bottom edge.
    const sampleHeight = Math.min(stripHeight, height);
    const overlap = Math.min(
      Math.round(HERO_EXTENSION_BLUR_SIGMA * 1.5),
      Math.floor(height / 4),
      extensionHeight,
    );
    const layerHeight = extensionHeight + overlap;

    const stretchedBlur = await sharp(source)
      .extract({
        left: 0,
        top: height - sampleHeight,
        width,
        height: sampleHeight,
      })
      .resize({ width, height: layerHeight, fit: "fill" })
      .blur(HERO_EXTENSION_BLUR_SIGMA)
      .png()
      .toBuffer();

    // Fade-in mask so the blurred strip eases in from the seam instead of a hard
    // cut at the top of the overlap band.
    const overlapFadeInSvg =
      Buffer.from(`<svg width="${width}" height="${layerHeight}">
        <defs>
            <linearGradient id="in" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="black" stop-opacity="0"/>
                <stop offset="${(overlap / layerHeight).toFixed(4)}" stop-color="black" stop-opacity="1"/>
                <stop offset="1" stop-color="black" stop-opacity="1"/>
            </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#in)"/>
    </svg>`);
    const fadeInMaskBuffer = await sharp(overlapFadeInSvg).png().toBuffer();

    const blurWithFadeIn = await sharp(stretchedBlur)
      .composite([{ input: fadeInMaskBuffer, blend: "dest-in" }])
      .png()
      .toBuffer();

    // Fade-out mask for the flat dominant-colour wash the extension dissolves
    // into towards the bottom.
    const fadeOutOffset = (overlap / layerHeight).toFixed(4);
    const fadeMaskSvg =
      Buffer.from(`<svg width="${width}" height="${layerHeight}">
        <defs>
            <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="black" stop-opacity="0"/>
                <stop offset="${fadeOutOffset}" stop-color="black" stop-opacity="0"/>
                <stop offset="${(overlap / layerHeight + 0.65 * (1 - overlap / layerHeight)).toFixed(4)}" stop-color="black" stop-opacity="0.55"/>
                <stop offset="1" stop-color="black" stop-opacity="1"/>
            </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#fade)"/>
    </svg>`);
    const fadeOutMaskBuffer = await sharp(fadeMaskSvg).png().toBuffer();

    const flatColorLayer = await sharp({
      create: {
        width,
        height: layerHeight,
        channels: 3,
        background: { r: rMean, g: gMean, b: bMean },
      },
    })
      .composite([{ input: fadeOutMaskBuffer, blend: "dest-in" }])
      .png()
      .toBuffer();

    const buffer = await sharp({
      create: {
        width,
        height: layerHeight,
        channels: 4,
        background: { r: rMean, g: gMean, b: bMean, alpha: 0 },
      },
    })
      .composite([
        { input: blurWithFadeIn, top: 0, left: 0 },
        { input: flatColorLayer, top: 0, left: 0 },
      ])
      .png()
      .toBuffer();

    return { buffer, overlap };
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
    const foreground =
      luminance > 0.52 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
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
   * Difference hash (dHash) is deliberately computed from the normalized
   * source, so file format, compression and EXIF rotation do not affect the
   * result. It is a compact visual-similarity signal, not a security hash.
   */
  private async perceptualHash(source: Buffer): Promise<string> {
    const { data } = await sharp(source)
      .resize(PERCEPTUAL_HASH_WIDTH, PERCEPTUAL_HASH_HEIGHT, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let bits = "";
    for (let row = 0; row < PERCEPTUAL_HASH_HEIGHT; row += 1) {
      const offset = row * PERCEPTUAL_HASH_WIDTH;
      for (let column = 0; column < PERCEPTUAL_HASH_WIDTH - 1; column += 1) {
        bits += data[offset + column] >= data[offset + column + 1] ? "1" : "0";
      }
    }
    return Array.from({ length: 16 }, (_, index) =>
      Number.parseInt(bits.slice(index * 4, index * 4 + 4), 2).toString(16),
    ).join("");
  }

  private async heroTextPalette(source: Buffer): Promise<HeroTextPalette> {
    const metadata = await sharp(source).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width <= 0 || height <= 0) {
      return {
        bgColor: "2c2c2e",
        textColor1: HERO_TEXT_PRIMARY,
        textColor2: HERO_TEXT_SECONDARY,
        textColor3: HERO_TEXT_TERTIARY,
        textColor4: HERO_TEXT_QUATERNARY,
        scrimColor: "000000",
        scrimOpacity: 0.3,
      };
    }

    const top = Math.min(
      height - 1,
      Math.floor(height * HERO_TEXT_REGION_START),
    );
    const { data, info } = await sharp(source)
      .extract({ left: 0, top, width, height: height - top })
      .removeAlpha()
      .resize({ width: 96, height: 96, fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const luminances: number[] = [];
    let redTotal = 0;
    let greenTotal = 0;
    let blueTotal = 0;
    for (let offset = 0; offset < data.length; offset += info.channels) {
      const red = data[offset] ?? 0;
      const green = data[offset + 1] ?? 0;
      const blue = data[offset + 2] ?? 0;
      redTotal += red;
      greenTotal += green;
      blueTotal += blue;
      luminances.push(this.relativeLuminance(red, green, blue));
    }
    luminances.sort((left, right) => left - right);

    const brightest = this.percentile(
      luminances,
      1 - HERO_TEXT_CONTRAST_PERCENTILE,
    );
    const sampleCount = Math.max(1, luminances.length);
    const background = {
      r: Math.round(redTotal / sampleCount),
      g: Math.round(greenTotal / sampleCount),
      b: Math.round(blueTotal / sampleCount),
    };
    const usesDarkText = this.isNearWhite(background);
    if (usesDarkText) {
      return {
        bgColor: this.hexColor(background),
        textColor1: HERO_DARK_TEXT_PRIMARY,
        textColor2: HERO_DARK_TEXT_SECONDARY,
        textColor3: HERO_DARK_TEXT_TERTIARY,
        textColor4: HERO_TEXT_QUATERNARY,
      };
    }

    const maximumReadableLuminance = 1.05 / MINIMUM_TEXT_CONTRAST - 0.05;
    const requiredOpacity =
      brightest <= maximumReadableLuminance
        ? 0
        : 1 - maximumReadableLuminance / brightest;
    return {
      bgColor: this.hexColor(background),
      textColor1: HERO_TEXT_PRIMARY,
      textColor2: HERO_TEXT_SECONDARY,
      textColor3: HERO_TEXT_TERTIARY,
      textColor4: HERO_TEXT_QUATERNARY,
      scrimColor: "000000",
      scrimOpacity: Math.max(0.24, Math.min(0.72, requiredOpacity + 0.08)),
    };
  }

  private relativeLuminance(red: number, green: number, blue: number) {
    const linear = (channel: number) => {
      const value = channel / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    };

    return (
      0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
    );
  }

  private isNearWhite(color: { r: number; g: number; b: number }): boolean {
    const maximum = Math.max(color.r, color.g, color.b);
    const minimum = Math.min(color.r, color.g, color.b);
    return maximum >= 238 && minimum >= 220 && maximum - minimum <= 28;
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
      .map((channel) =>
        Math.max(0, Math.min(255, channel)).toString(16).padStart(2, "0"),
      )
      .join("");
  }

  private async processVideo(asset: Asset): Promise<AssetProcessingResult> {
    const workDirectory = await mkdtemp(join(tmpdir(), "musical-asset-"));
    const sourceExtension = extname(asset.filename) || ".video";
    const sourcePath = join(workDirectory, `source${sourceExtension}`);
    const rawPosterPath = join(workDirectory, "poster-raw.png");
    const posterWidths = [320, 480, 640, 960, 1280, 1920, 2400];
    const posterRenditions = posterWidths.map((width) => ({
      width,
      height: Math.round((width * 9) / 16),
      filename: `poster-${width}w.webp`,
      path: join(workDirectory, `poster-${width}w.webp`),
    }));

    const TARGET_RESOLUTIONS = [
      { name: "720p", width: 1280, bitrate: "2800k", bandwidth: 2800000 },
      { name: "1080p", width: 1920, bitrate: "5000k", bandwidth: 5000000 },
      { name: "1440p", width: 2560, bitrate: "9000k", bandwidth: 9000000 },
      { name: "2160p", width: 3840, bitrate: "14000k", bandwidth: 14000000 },
    ];
    const keepAudio = asset.purpose === AssetPurpose.MUSIC_VIDEO;

    try {
      await this.storage.downloadToFile(asset.sourceObjectKey, sourcePath);
      this.verifyChecksum(asset, await this.fileChecksum(sourcePath));
      const sourceProbe = await this.probe(sourcePath);
      const sourceVideo = sourceProbe.streams?.find(
        (stream) => stream.codec_type === "video",
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
        throw new Error("VIDEO_METADATA_INVALID");
      }

      // Filter resolutions to only target widths <= sourceWidth
      const activeResolutions = TARGET_RESOLUTIONS.filter(
        (res) => res.width <= sourceWidth,
      );
      if (activeResolutions.length === 0) {
        activeResolutions.push(TARGET_RESOLUTIONS[0]);
      }

      // Short, fixed segments keep adaptive bitrate switching and seeking
      // responsive regardless of the source video duration.
      const hlsTime = this.videoHlsSegmentDurationSeconds;
      const videoEncryption = keepAudio
        ? await this.prepareMusicVideoEncryption(asset.id, workDirectory)
        : undefined;
      // This prefix is never overwritten. If a job retries, CDN-cached objects
      // from an earlier attempt cannot be paired with the new AES key.
      const videoOutputPrefix = `processed/${asset.id}/video/${randomUUID()}`;
      const hlsRenditions = activeResolutions.map((resolution) => ({
        ...resolution,
        // Playlist and segment object names are opaque implementation details.
        // AES encryption protects content; unguessable names prevent casual URL
        // enumeration and keep storage layout independent from presentation.
        playlistFile: `${randomBytes(12).toString('hex')}.m3u8`,
        segmentPrefix: randomBytes(18).toString('base64url'),
      }));

      // Transcode each resolution
      for (const rendition of hlsRenditions) {
        const playlistPath = join(workDirectory, rendition.playlistFile);
        const segmentPattern = join(
          workDirectory,
          `${rendition.segmentPrefix}_%013d.ts`,
        );

        await this.run(this.ffmpegPath, [
          "-y",
          "-i",
          sourcePath,
          "-map",
          "0:v:0",
          ...(keepAudio
            ? ["-map", "0:a:0?", "-c:a", "aac", "-b:a", "160k"]
            : ["-an"]),
          "-vf",
          `scale=w='min(${rendition.width},iw)':h=-2`,
          "-c:v",
          "libx264",
          "-preset",
          "medium",
          "-crf",
          "23",
          "-b:v",
          rendition.bitrate,
          "-maxrate",
          rendition.bitrate,
          "-bufsize",
          `${parseInt(rendition.bitrate) * 2}k`,
          "-pix_fmt",
          "yuv420p",
          "-force_key_frames",
          `expr:gte(t,n_forced*${hlsTime})`,
          "-sc_threshold",
          "0",
          "-hls_time",
          String(hlsTime),
          "-hls_playlist_type",
          "vod",
          "-hls_flags",
          "independent_segments",
          "-hls_start_number_source",
          "epoch_us",
          "-hls_segment_filename",
          segmentPattern,
          ...(videoEncryption
            ? ["-hls_key_info_file", videoEncryption.keyInfoPath]
            : []),
          playlistPath,
        ]);
      }

      // Extract raw poster frame
      await this.run(this.ffmpegPath, [
        "-y",
        "-ss",
        String(Math.min(1, durationSeconds / 10)),
        "-i",
        sourcePath,
        "-frames:v",
        "1",
        rawPosterPath,
      ]);

      // Responsive 16:9 WebP posters let shelf cards load a compact image,
      // while the detail page can still use a high-density poster.
      for (const poster of posterRenditions) {
        await sharp(rawPosterPath)
          .resize(poster.width, poster.height, { fit: "cover" })
          .webp({ quality: 85 })
          .toFile(poster.path);
      }

      // Write master default.m3u8 playlist file
      let masterPlaylistContent = "#EXTM3U\n#EXT-X-VERSION:3\n";
      const parsedRenditions: Array<{
        name: string;
        width: number;
        height: number;
        playlistFile: string;
      }> = [];

      for (const rendition of hlsRenditions) {
        const subPlaylistName = rendition.playlistFile;

        // Find actual resolution of transcoded segments
        const allFiles = await readdir(workDirectory);
        const resSegments = allFiles.filter(
          (file) =>
            file.startsWith(`${rendition.segmentPrefix}_`) &&
            file.endsWith(".ts"),
        );
        let actualWidth = rendition.width;
        let actualHeight = Math.round(
          (rendition.width * sourceHeight) / sourceWidth,
        );

        if (resSegments[0]) {
          try {
            const probeResult = await this.probe(
              join(workDirectory, resSegments[0]),
            );
            const videoStream = probeResult.streams?.find(
              (stream) => stream.codec_type === "video",
            );
            if (videoStream?.width && videoStream?.height) {
              actualWidth = videoStream.width;
              actualHeight = videoStream.height;
            }
          } catch {
            // keep default calculation
          }
        }

        masterPlaylistContent += `#EXT-X-STREAM-INF:BANDWIDTH=${rendition.bandwidth},RESOLUTION=${actualWidth}x${actualHeight}\n`;
        masterPlaylistContent += `${subPlaylistName}\n`;

        parsedRenditions.push({
          name: rendition.name,
          width: actualWidth,
          height: actualHeight,
          playlistFile: subPlaylistName,
        });
      }

      const masterPlaylistPath = join(workDirectory, "default.m3u8");
      await writeFile(masterPlaylistPath, masterPlaylistContent, "utf8");

      // Upload all segments, sub-playlists, master playlist and WebP poster variants to S3/R2 storage
      const finalFiles = await readdir(workDirectory);
      await this.mapWithConcurrency(
        finalFiles,
        this.videoUploadConcurrency,
        async (file) => {
          const filePath = join(workDirectory, file);
          const objectKey = `${videoOutputPrefix}/${file}`;

          if (file.endsWith(".ts")) {
            await this.storage.uploadFile(objectKey, filePath, "video/MP2T");
          } else if (file.endsWith(".m3u8")) {
            await this.storage.uploadFile(
              objectKey,
              filePath,
              "application/x-mpegURL",
            );
          } else if (file.startsWith("poster-") && file.endsWith(".webp")) {
            await this.storage.uploadFile(objectKey, filePath, "image/webp");
          }
        },
      );

      const masterPlaylistObjectKey = `${videoOutputPrefix}/default.m3u8`;
      const resolvedPosterRenditions = await Promise.all(
        posterRenditions.map(async (poster) => ({
          ...poster,
          objectKey: `${videoOutputPrefix}/${poster.filename}`,
          url: this.storage.publicUrl(
            `${videoOutputPrefix}/${poster.filename}`,
          ),
          contentType: "image/webp",
          sizeBytes: (await stat(poster.path)).size,
        })),
      );
      const primaryPoster = resolvedPosterRenditions.at(-1)!;

      const masterFileStats = await stat(masterPlaylistPath);
      const masterPlaylistUrl = this.storage.publicUrl(masterPlaylistObjectKey);

      const renditions = [
        {
          objectKey: masterPlaylistObjectKey,
          url: masterPlaylistUrl,
          contentType: "application/x-mpegURL",
          width: sourceWidth,
          height: sourceHeight,
          sizeBytes: masterFileStats.size,
        },
        ...parsedRenditions.map((item) => ({
          objectKey: `${videoOutputPrefix}/${item.playlistFile}`,
          url: this.storage.publicUrl(
            `${videoOutputPrefix}/${item.playlistFile}`,
          ),
          contentType: "application/x-mpegURL",
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
          generation: videoOutputPrefix,
          renditions,
          poster: {
            objectKey: primaryPoster.objectKey,
            url: primaryPoster.url,
            contentType: primaryPoster.contentType,
            width: primaryPoster.width,
            height: primaryPoster.height,
            sizeBytes: primaryPoster.sizeBytes,
            variants: {
              renditions: resolvedPosterRenditions.map(
                ({ objectKey, url, contentType, width, height, sizeBytes }) => ({
                  objectKey,
                  url,
                  contentType,
                  width,
                  height,
                  sizeBytes,
                }),
              ),
            },
          },
        }),
        ...(videoEncryption
          ? {
              videoEncryption: {
                ciphertext: videoEncryption.ciphertext,
                iv: videoEncryption.encryptionIv,
                authTag: videoEncryption.authTag,
              },
            }
          : {}),
      };
    } finally {
      await rm(workDirectory, { recursive: true, force: true });
    }
  }

  private async probe(filePath: string): Promise<ProbeResult> {
    const { stdout } = await this.run(this.ffprobePath, [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      filePath,
    ]);
    return JSON.parse(stdout) as ProbeResult;
  }

  private async prepareMusicVideoEncryption(
    assetId: string,
    workDirectory: string,
  ): Promise<{
    keyInfoPath: string;
    ciphertext: Buffer;
    encryptionIv: Buffer;
    authTag: Buffer;
  }> {
    if (!this.videoKeyUriBase || !this.videoKeyEncryptionKey) {
      throw new Error("MUSIC_VIDEO_ENCRYPTION_NOT_CONFIGURED");
    }

    const hlsKey = randomBytes(16);
    const encryptedKey = encryptVideoKey(this.videoKeyEncryptionKey, hlsKey);
    const keyPath = join(workDirectory, "hls.key");
    const keyInfoPath = join(workDirectory, "hls-key-info.txt");
    await writeFile(keyPath, hlsKey, { mode: 0o600 });
    await writeFile(
      keyInfoPath,
      `${this.videoKeyUriBase}/${encodeURIComponent(assetId)}/key\n${keyPath}\n`,
      { mode: 0o600 },
    );
    return {
      keyInfoPath,
      ciphertext: Buffer.from(encryptedKey.ciphertext),
      encryptionIv: Buffer.from(encryptedKey.iv),
      authTag: Buffer.from(encryptedKey.authTag),
    };
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
          encoding: "utf8",
          maxBuffer: 4 * 1024 * 1024,
          timeout: PROCESS_TIMEOUT_MS,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          this.activeChild = undefined;
          if (error) {
            reject(
              error instanceof Error
                ? error
                : new Error("ASSET_PROCESS_COMMAND_FAILED"),
            );
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
    this.activeChild?.kill("SIGTERM");
  }

  private json(value: object): Prisma.InputJsonObject {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
  }

  private bufferChecksum(value: Buffer): string {
    return createHash("sha256").update(value).digest("hex");
  }

  private async fileChecksum(filePath: string): Promise<string> {
    const hash = createHash("sha256");
    await pipeline(createReadStream(filePath), hash);
    return hash.digest("hex");
  }

  private verifyChecksum(asset: Asset, checksum: string): void {
    if (checksum !== asset.checksum) {
      throw new Error("ASSET_CHECKSUM_MISMATCH");
    }
  }

  private positiveInteger(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private async mapWithConcurrency<Input, Output>(
    inputs: readonly Input[],
    maxConcurrency: number,
    mapper: (input: Input) => Promise<Output>,
  ): Promise<Output[]> {
    const outputs = new Array<Output>(inputs.length);
    let nextIndex = 0;
    const worker = async (): Promise<void> => {
      while (nextIndex < inputs.length) {
        const index = nextIndex;
        nextIndex += 1;
        outputs[index] = await mapper(inputs[index]);
      }
    };

    await Promise.all(
      Array.from(
        { length: Math.min(maxConcurrency, inputs.length) },
        () => worker(),
      ),
    );
    return outputs;
  }
}

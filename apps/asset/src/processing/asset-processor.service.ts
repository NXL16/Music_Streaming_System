import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  Asset,
  AssetKind,
  AssetPurpose,
  Prisma,
} from "../generated/prisma/client";
import { StorageService } from "../storage/storage.service";
import { AssetProcessingResult, MediaRendition } from "./asset-processor.types";
import { deriveArtworkPalette } from "./artwork-theme";

const NORMAL_ARTWORK_WIDTHS = [40, 80, 296, 316, 592, 632];
const STATION_ARTWORK_WIDTHS = [296, 316, 592, 632];
const AVATAR_SIZES = [40, 80, 256];
const AVATAR_MAX_INPUT_PIXELS = 25_000_000;
const DEFAULT_ARTWORK_MAX_INPUT_PIXELS = 30_000_000;
const DEFAULT_IMAGE_RENDITION_CONCURRENCY = 2;
const HERO_ARTWORK_WIDTHS = [450, 600, 900, 1200];
const HERO_ASPECT_RATIO = 3 / 4;
const HERO_EXTENSION_STRIP = 48;
const HERO_EXTENSION_BLUR_SIGMA = 28;
const HERO_DARK_EDGE_MIN_LUMINANCE = 10;
const HERO_DARK_EDGE_MEAN_LUMINANCE = 35;
const HERO_NEUTRAL_BLACK_MAX_CHROMA = 7;
const HERO_TEXT_REGION_START = 0.78;
const PERCEPTUAL_HASH_WIDTH = 9;
const PERCEPTUAL_HASH_HEIGHT = 8;
const VIDEO_TRANSCODE_STATUS_POLL_MS = 5_000;
interface HeroBackgroundPalette {
  bgColor: string;
}

@Injectable()
export class AssetProcessorService {
  private readonly artworkMaxInputPixels: number;
  private readonly imageRenditionConcurrency: number;
  private readonly videoTranscodeUrl: string;
  private readonly videoTranscodeStatusUrl: string;
  private readonly videoTranscodeSharedSecret: string;
  private readonly videoTranscodeTimeoutMs: number;

  constructor(
    private readonly storage: StorageService,
    config: ConfigService,
  ) {
    this.artworkMaxInputPixels = this.positiveInteger(
      config.get<string>("ASSET_ARTWORK_MAX_INPUT_PIXELS"),
      DEFAULT_ARTWORK_MAX_INPUT_PIXELS,
    );
    this.imageRenditionConcurrency = this.positiveInteger(
      config.get<string>("ASSET_IMAGE_RENDITION_CONCURRENCY"),
      DEFAULT_IMAGE_RENDITION_CONCURRENCY,
    );
    this.videoTranscodeUrl =
      config.get<string>("VIDEO_TRANSCODE_URL")?.replace(/\/+$/, "") ?? "";
    this.videoTranscodeStatusUrl =
      config
        .get<string>("VIDEO_TRANSCODE_STATUS_URL")
        ?.replace(/\/+$/, "") ??
      this.videoTranscodeUrl.replace(
        /-transcode\.modal\.run$/,
        "-status.modal.run",
      );
    this.videoTranscodeSharedSecret =
      config.get<string>("VIDEO_TRANSCODE_SHARED_SECRET")?.trim() ?? "";
    this.videoTranscodeTimeoutMs = this.positiveInteger(
      config.get<string>("VIDEO_TRANSCODE_TIMEOUT_MS"),
      90 * 60 * 1000,
    );
  }

  process(
    asset: Asset,
    operationId?: string,
    signal?: AbortSignal,
  ): Promise<AssetProcessingResult> {
    if (asset.kind === AssetKind.IMAGE) {
      if (asset.purpose === AssetPurpose.PROFILE_AVATAR) {
        return this.processAvatar(asset);
      }
      if (asset.purpose === AssetPurpose.STATION_ARTWORK) {
        return this.processStationArtwork(asset);
      }
      return this.processArtwork(asset);
    }
    return this.processVideoOnModal(asset, operationId, signal);
  }

  async replaceMusicVideoPoster(
    asset: Asset,
    posterTimestampMillis: number,
  ): Promise<Prisma.InputJsonObject> {
    if (asset.purpose !== AssetPurpose.MUSIC_VIDEO) {
      throw new Error("MUSIC_VIDEO_POSTER_NOT_REPLACEABLE");
    }
    const generation = this.string(this.object(asset.variants).generation);
    if (!generation) throw new Error("MUSIC_VIDEO_GENERATION_MISSING");

    const payload = await this.callVideoTranscodeModal({
      operation: "replace_poster",
      assetId: asset.id,
      sourceKey: asset.sourceObjectKey,
      filename: asset.filename,
      checksum: asset.checksum,
      contentType: asset.contentType,
      purpose: asset.purpose,
      generation,
      posterTimestampMillis,
    });
    const poster = this.object(payload.poster);
    const resolvedTimestamp = Number(poster.timestampMillis);
    if (
      !this.string(poster.url) ||
      !Number.isFinite(resolvedTimestamp) ||
      resolvedTimestamp < 0
    ) {
      throw new Error("VIDEO_TRANSCODE_MODAL_INVALID_POSTER_RESPONSE");
    }
    return this.json(poster);
  }

  private async processVideoOnModal(
    asset: Asset,
    operationId?: string,
    signal?: AbortSignal,
  ): Promise<AssetProcessingResult> {
    if (!operationId) {
      throw new Error("VIDEO_TRANSCODE_OPERATION_ID_MISSING");
    }
    const payload = await this.waitForVideoTranscodeModal({
      operation: "transcode",
      operationId,
      assetId: asset.id,
      sourceKey: asset.sourceObjectKey,
      filename: asset.filename,
      checksum: asset.checksum,
      contentType: asset.contentType,
      purpose: asset.purpose,
      posterTimestampMillis: asset.posterTimestampMillis,
    }, signal);
    const encryption = payload.videoEncryption as
      | Record<string, unknown>
      | undefined;
    const requiresEncryption = asset.purpose === AssetPurpose.MUSIC_VIDEO;
    if (
      typeof payload.publicUrl !== "string" ||
      !Number.isFinite(payload.width) ||
      !Number.isFinite(payload.height) ||
      !Number.isFinite(payload.durationMillis) ||
      !payload.variants ||
      (requiresEncryption &&
        (typeof encryption?.ciphertext !== "string" ||
          typeof encryption.iv !== "string" ||
          typeof encryption.authTag !== "string"))
    ) {
      throw new Error("VIDEO_TRANSCODE_MODAL_INVALID_RESPONSE");
    }
    return {
      publicUrl: payload.publicUrl,
      width: Number(payload.width),
      height: Number(payload.height),
      durationMillis: Number(payload.durationMillis),
      variants: payload.variants,
      ...(requiresEncryption
        ? {
            videoEncryption: {
              ciphertext: Buffer.from(
                encryption!.ciphertext as string,
                "base64",
              ),
              iv: Buffer.from(encryption!.iv as string, "base64"),
              authTag: Buffer.from(encryption!.authTag as string, "base64"),
            },
          }
        : {}),
    };
  }

  private async callVideoTranscodeModal(
    body: Record<string, unknown>,
    signal?: AbortSignal,
    endpoint = this.videoTranscodeUrl,
  ): Promise<Record<string, unknown>> {
    if (!endpoint || !this.videoTranscodeSharedSecret) {
      throw new Error("VIDEO_TRANSCODE_MODAL_NOT_CONFIGURED");
    }
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.videoTranscodeSharedSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: signal
        ? AbortSignal.any([
            signal,
            AbortSignal.timeout(this.videoTranscodeTimeoutMs),
          ])
        : AbortSignal.timeout(this.videoTranscodeTimeoutMs),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok) {
      throw new Error(
        typeof payload.detail === "string"
          ? payload.detail
          : "VIDEO_TRANSCODE_MODAL_FAILED",
      );
    }
    return payload;
  }

  private async waitForVideoTranscodeModal(
    request: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const assetId = this.string(request.assetId);
    const operationId = this.string(request.operationId);
    const deadline = Date.now() + this.videoTranscodeTimeoutMs;
    let payload = await this.callVideoTranscodeModal(request, signal);

    while (payload.status === "PROCESSING") {
      if (Date.now() >= deadline) {
        throw new Error("VIDEO_TRANSCODE_MODAL_STATUS_TIMEOUT");
      }
      await new Promise((resolve) =>
        setTimeout(resolve, VIDEO_TRANSCODE_STATUS_POLL_MS),
      );
      if (signal?.aborted) {
        throw new Error("VIDEO_TRANSCODE_OPERATION_ABORTED");
      }
      payload = await this.callVideoTranscodeModal({
        operation: "status",
        operationId,
        assetId,
      }, signal, this.videoTranscodeStatusUrl);
    }

    if (payload.status === "FAILED") {
      throw new Error(
        this.string(payload.error) || "VIDEO_TRANSCODE_MODAL_FAILED",
      );
    }
    return payload;
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
    const palette = await deriveArtworkPalette(normalizedSource);
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
    const heroBackgroundPalette = await this.heroBackgroundPalette(heroSource);
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
          palette: heroBackgroundPalette,
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
    const edgeChroma =
      Math.max(rMean, gMean, bMean) - Math.min(rMean, gMean, bMean);

    // BRANCH 1: neutral near-black bottom edge. Dark blue, red, and purple have
    // similarly low luminance but need the blurred colour extension below.
    if (
      minLuminance < HERO_DARK_EDGE_MIN_LUMINANCE &&
      meanLuminance < HERO_DARK_EDGE_MEAN_LUMINANCE &&
      edgeChroma <= HERO_NEUTRAL_BLACK_MAX_CHROMA
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

  private async heroBackgroundPalette(
    source: Buffer,
  ): Promise<HeroBackgroundPalette> {
    const metadata = await sharp(source).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width <= 0 || height <= 0) {
      return {
        bgColor: "2c2c2e",
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
    }
    const sampleCount = Math.max(1, data.length / info.channels);
    const background = {
      r: Math.round(redTotal / sampleCount),
      g: Math.round(greenTotal / sampleCount),
      b: Math.round(blueTotal / sampleCount),
    };
    return {
      bgColor: this.hexColor(background),
    };
  }

  private hexColor(color: { r: number; g: number; b: number }): string {
    return [color.r, color.g, color.b]
      .map((channel) =>
        Math.max(0, Math.min(255, channel)).toString(16).padStart(2, "0"),
      )
      .join("");
  }

  private json(value: object): Prisma.InputJsonObject {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
  }

  private object(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private string(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
  }

  private bufferChecksum(value: Buffer): string {
    return createHash("sha256").update(value).digest("hex");
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
      Array.from({ length: Math.min(maxConcurrency, inputs.length) }, () =>
        worker(),
      ),
    );
    return outputs;
  }
}

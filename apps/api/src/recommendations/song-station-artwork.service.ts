import { BadGatewayException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AssetKind, AssetPurpose, AssetStatus } from '@musical/shared-proto';
import sharp from 'sharp';
import { AssetsService } from '../assets/assets.service';
import {
  detectStationArtworkBackgroundColor,
  stationArtworkBackgroundSvg,
} from './station-artwork-color';

const OUTPUT_SIZE = 1080;
const COVER_SIZE = 800;
const ARTWORK_WAIT_ATTEMPTS = 60;
const ARTWORK_WAIT_MILLISECONDS = 250;

@Injectable()
export class SongStationArtworkService {
  private readonly inFlightArtwork = new Map<
    string,
    Promise<{ assetId: string; backgroundColor: string }>
  >();

  constructor(private readonly assetsService: AssetsService) {}

  async create(input: {
    actorUserId: string;
    stationId: string;
    sourceArtworkUrl: string;
  }): Promise<{ assetId: string; backgroundColor: string }> {
    const key = [
      input.actorUserId,
      input.stationId,
      input.sourceArtworkUrl,
    ].join(':');
    const existing = this.inFlightArtwork.get(key);
    if (existing) return existing;

    const request = this.createOnce(input);
    this.inFlightArtwork.set(key, request);
    const clearRequest = () => {
      if (this.inFlightArtwork.get(key) === request) {
        this.inFlightArtwork.delete(key);
      }
    };
    void request.then(clearRequest, clearRequest);
    return request;
  }

  private async createOnce(input: {
    actorUserId: string;
    stationId: string;
    sourceArtworkUrl: string;
  }): Promise<{ assetId: string; backgroundColor: string }> {
    const source = await this.downloadSource(input.sourceArtworkUrl);
    const backgroundColor = await detectStationArtworkBackgroundColor(source);
    const webp = await this.render(source, backgroundColor);
    const checksum = createHash('sha256').update(webp).digest('hex');
    const upload = await this.assetsService.requestUpload({
      actorUserId: input.actorUserId,
      kind: AssetKind.ASSET_KIND_IMAGE,
      purpose: AssetPurpose.ASSET_PURPOSE_STATION_ARTWORK,
      filename: `${input.stationId}.webp`,
      contentType: 'image/webp',
      checksum,
      sizeBytes: webp.byteLength,
    });

    if (upload.uploadUrl) {
      const response = await fetch(upload.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': 'image/webp' },
        body: new Uint8Array(webp),
      });
      if (!response.ok) {
        throw new BadGatewayException('SONG_STATION_ARTWORK_UPLOAD_FAILED');
      }
      if (!upload.asset) {
        throw new BadGatewayException(
          'SONG_STATION_ARTWORK_UPLOAD_RESPONSE_INVALID',
        );
      }
      await this.assetsService.finalizeUpload({
        assetId: upload.asset.id,
        actorUserId: input.actorUserId,
      });
    }

    if (!upload.asset) {
      throw new BadGatewayException(
        'SONG_STATION_ARTWORK_UPLOAD_RESPONSE_INVALID',
      );
    }
    const asset = await this.waitForReadyAsset(upload.asset.id);
    return { assetId: asset.id, backgroundColor };
  }

  private async downloadSource(url: string): Promise<Buffer> {
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    } catch {
      throw new BadGatewayException('SONG_STATION_SOURCE_ARTWORK_UNAVAILABLE');
    }
    if (!response.ok) {
      throw new BadGatewayException('SONG_STATION_SOURCE_ARTWORK_UNAVAILABLE');
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private async waitForReadyAsset(assetId: string) {
    for (let attempt = 0; attempt < ARTWORK_WAIT_ATTEMPTS; attempt += 1) {
      const response = await this.assetsService.getAsset({ assetId });
      const asset = response.asset;
      if (asset?.status === AssetStatus.ASSET_STATUS_READY) return asset;
      if (asset?.status === AssetStatus.ASSET_STATUS_FAILED) {
        throw new BadGatewayException('SONG_STATION_ARTWORK_PROCESSING_FAILED');
      }
      await new Promise((resolve) =>
        setTimeout(resolve, ARTWORK_WAIT_MILLISECONDS),
      );
    }
    throw new BadGatewayException('SONG_STATION_ARTWORK_PROCESSING_TIMEOUT');
  }

  private async render(
    source: Buffer,
    backgroundColor: string,
  ): Promise<Buffer> {
    const cover = await sharp(source)
      .rotate()
      .resize(COVER_SIZE, COVER_SIZE, { fit: 'cover' })
      .ensureAlpha()
      .composite([
        { input: this.roundedMask(COVER_SIZE, 26), blend: 'dest-in' },
      ])
      .webp({ quality: 90, effort: 4, smartSubsample: true })
      .toBuffer();
    const offset = (OUTPUT_SIZE - COVER_SIZE) / 2;
    const background = Buffer.from(
      stationArtworkBackgroundSvg(backgroundColor),
    );
    const shadow = Buffer.from(this.shadowSvg(offset));
    return sharp({
      create: {
        width: OUTPUT_SIZE,
        height: OUTPUT_SIZE,
        channels: 4,
        background: '#000000',
      },
    })
      .composite([
        { input: background },
        { input: shadow },
        { input: cover, left: offset, top: offset },
      ])
      .webp({ quality: 90, effort: 4, smartSubsample: true })
      .toBuffer();
  }

  private shadowSvg(offset: number): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"><defs><filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feGaussianBlur in="SourceAlpha" stdDeviation="17"/><feOffset dy="18"/><feComponentTransfer><feFuncA type="linear" slope=".28"/></feComponentTransfer><feMerge><feMergeNode/></feMerge></filter></defs><rect x="${offset}" y="${offset}" width="800" height="800" rx="26" fill="#000" filter="url(#shadow)"/></svg>`;
  }

  private roundedMask(size: number, radius: number): Buffer {
    return Buffer.from(
      `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/></svg>`,
    );
  }
}

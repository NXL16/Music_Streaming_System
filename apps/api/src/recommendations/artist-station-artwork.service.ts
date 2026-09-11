import { BadGatewayException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AssetKind, AssetPurpose, AssetStatus } from '@musical/shared-proto';
import sharp from 'sharp';
import { AssetsService } from '../assets/assets.service';
import {
  detectStationArtworkBackgroundColor,
  stationArtworkBackgroundSvg,
} from './station-artwork-color';

const SIZE = 1080;
const WAIT_ATTEMPTS = 80;

@Injectable()
export class ArtistStationArtworkService {
  private readonly inFlight = new Map<
    string,
    Promise<{ assetId: string; backgroundColor: string }>
  >();
  constructor(private readonly assets: AssetsService) {}

  create(input: {
    actorUserId: string;
    stationId: string;
    artworkUrls: string[];
    layout: 'composite' | 'portrait';
  }) {
    // A public canonical Station has one cover, regardless of which listener
    // reaches it first. Deduplicate across users so a simultaneous Home load
    // cannot create and upload the same artwork more than once.
    const key = `${input.stationId}:${input.layout}:${input.artworkUrls.join(':')}`;
    const current = this.inFlight.get(key);
    if (current) return current;
    const request = this.createOnce(input);
    this.inFlight.set(key, request);
    void request
      .finally(() => {
        if (this.inFlight.get(key) === request) this.inFlight.delete(key);
      })
      .catch(() => undefined);
    return request;
  }

  private async createOnce(input: {
    actorUserId: string;
    stationId: string;
    artworkUrls: string[];
    layout: 'composite' | 'portrait';
  }) {
    const urls = input.artworkUrls.filter(Boolean).slice(0, input.layout === 'portrait' ? 1 : 3);
    if (urls.length !== (input.layout === 'portrait' ? 1 : 3))
      throw new BadGatewayException('ARTIST_STATION_ARTWORK_SOURCES_REQUIRED');
    const sources = await Promise.all(urls.map((url) => this.download(url)));
    const backgroundColor = await detectStationArtworkBackgroundColor(
      sources[0],
    );
    const image = await this.render(sources, backgroundColor, input.layout);
    const upload = await this.assets.requestUpload({
      actorUserId: input.actorUserId,
      kind: AssetKind.ASSET_KIND_IMAGE,
      purpose: AssetPurpose.ASSET_PURPOSE_ARTWORK,
      filename: `${input.stationId}.webp`,
      contentType: 'image/webp',
      checksum: createHash('sha256').update(image).digest('hex'),
      sizeBytes: image.byteLength,
    });
    if (!upload.asset)
      throw new BadGatewayException(
        'ARTIST_STATION_ARTWORK_UPLOAD_RESPONSE_INVALID',
      );
    if (upload.uploadUrl) {
      const result = await fetch(upload.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': 'image/webp' },
        body: new Uint8Array(image),
      });
      if (!result.ok)
        throw new BadGatewayException('ARTIST_STATION_ARTWORK_UPLOAD_FAILED');
      await this.assets.finalizeUpload({
        assetId: upload.asset.id,
        actorUserId: input.actorUserId,
      });
    }
    await this.wait(upload.asset.id);
    return { assetId: upload.asset.id, backgroundColor };
  }

  private async download(url: string) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error();
      return Buffer.from(await response.arrayBuffer());
    } catch {
      throw new BadGatewayException(
        'ARTIST_STATION_SOURCE_ARTWORK_UNAVAILABLE',
      );
    }
  }

  private async render(sources: Buffer[], color: string, layout: 'composite' | 'portrait') {
    if (layout === 'portrait') return this.renderPortrait(sources[0], color);
    const placements = [
      { left: 69, top: 42, size: 620 },
      { left: 606, top: 486, size: 400 },
      { left: 289, top: 689, size: 320 },
    ];
    const circles = await Promise.all(
      sources.map((source, index) =>
        this.circle(source, placements[index].size),
      ),
    );
    const layers: sharp.OverlayOptions[] = [
      { input: Buffer.from(stationArtworkBackgroundSvg(color)) },
    ];
    for (let index = 0; index < circles.length; index += 1) {
      const placement = placements[index];
      layers.push({
        input: Buffer.from(
          this.shadowSvg(placement.left, placement.top, placement.size),
        ),
        top: 0,
        left: 0,
      });
      layers.push({
        input: circles[index],
        left: placement.left,
        top: placement.top,
      });
    }
    return sharp({
      create: { width: SIZE, height: SIZE, channels: 4, background: '#000' },
    })
      .composite(layers)
      .webp({ quality: 90, effort: 4, smartSubsample: true })
      .toBuffer();
  }

  private async renderPortrait(source: Buffer, color: string) {
    const size = 800;
    const left = (SIZE - size) / 2;
    const top = (SIZE - size) / 2;
    return sharp({
      create: { width: SIZE, height: SIZE, channels: 4, background: '#000' },
    })
      .composite([
        { input: Buffer.from(stationArtworkBackgroundSvg(color)) },
        { input: Buffer.from(this.shadowSvg(left, top, size)), top: 0, left: 0 },
        { input: await this.circle(source, size), left, top },
      ])
      .webp({ quality: 90, effort: 4, smartSubsample: true })
      .toBuffer();
  }

  private circle(source: Buffer, size: number) {
    return sharp(source)
      .rotate()
      .resize(size, size, { fit: 'cover' })
      .ensureAlpha()
      .composite([
        {
          input: Buffer.from(
            `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
          ),
          blend: 'dest-in',
        },
      ])
      .webp({ quality: 90, effort: 4 })
      .toBuffer();
  }
  private shadowSvg(left: number, top: number, size: number) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"><defs><filter id="s" x="-30%" y="-30%" width="160%" height="170%"><feGaussianBlur in="SourceAlpha" stdDeviation="28"/><feOffset dy="14"/><feComponentTransfer><feFuncA type="linear" slope=".2"/></feComponentTransfer></filter></defs><circle cx="${left + size / 2}" cy="${top + size / 2}" r="${size / 2}" fill="#000" filter="url(#s)"/></svg>`;
  }

  private async wait(assetId: string) {
    for (let attempt = 0; attempt < WAIT_ATTEMPTS; attempt += 1) {
      const asset = (await this.assets.getAsset({ assetId })).asset;
      if (asset?.status === AssetStatus.ASSET_STATUS_READY) return;
      if (asset?.status === AssetStatus.ASSET_STATUS_FAILED)
        throw new BadGatewayException(
          'ARTIST_STATION_ARTWORK_PROCESSING_FAILED',
        );
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new BadGatewayException('ARTIST_STATION_ARTWORK_PROCESSING_TIMEOUT');
  }
}

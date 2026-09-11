import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { StrictJwtAuthGuard } from '../common/guards/strict-jwt-auth.guard';
import { AssetsService } from '../assets/assets.service';
import { PlaybackAccessService } from './playback-access.service';
import { MusicVideoCdnService } from './music-video-cdn.service';

/** Authenticated entrypoint for Music Video manifests and AES HLS keys. */
@Controller('playback/videos')
@UseGuards(StrictJwtAuthGuard)
export class MusicVideoPlaybackController {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly playbackAccess: PlaybackAccessService,
    private readonly cdn: MusicVideoCdnService,
  ) {}

  /**
   * Authenticated master-playlist entrypoint. Returning it as a response
   * instead of redirecting avoids a credentialed XHR crossing from API to
   * CDN; child playlist and segment URLs remain CDN-backed.
   */
  @Get(':assetId/manifest.m3u8')
  async getManifest(
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.playbackAccess.assertMusicVideoAvailable(assetId);
    const response = await this.assetsService.getAsset({ assetId });
    const manifestUrl = this.cdn.createManifestUrl(
      assetId,
      response.asset?.publicUrl ?? '',
    );
    let playlist: string;
    try {
      const cdnResponse = await fetch(manifestUrl);
      if (!cdnResponse.ok) {
        throw new Error(`CDN_MANIFEST_${cdnResponse.status}`);
      }
      playlist = await cdnResponse.text();
    } catch {
      throw new ServiceUnavailableException('MUSIC_VIDEO_MANIFEST_UNAVAILABLE');
    }

    res
      .status(200)
      .set({
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-store, private',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(this.absolutePlaylistUrls(playlist, manifestUrl));
  }

  @Get(':assetId/key')
  async getKey(
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.playbackAccess.assertMusicVideoAvailable(assetId);
    const keyResponse = await this.assetsService.getMusicVideoKey({ assetId });
    const key = Buffer.from(keyResponse.key);
    if (key.length !== 16) {
      throw new Error('MUSIC_VIDEO_KEY_INVALID');
    }
    res
      .status(200)
      .set({
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'no-store, private',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(key);
  }

  private absolutePlaylistUrls(playlist: string, manifestUrl: string): string {
    return playlist
      .split(/\r?\n/)
      .map((line) => {
        const reference = line.trim();
        if (!reference || reference.startsWith('#')) return line;
        return new URL(reference, manifestUrl).toString();
      })
      .join('\n');
  }
}

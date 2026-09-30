import {
  AssetKind,
  AssetPurpose,
  AssetStatus,
} from '@musical/shared-proto';
import { SystemStationArtworkService } from './system-station-artwork.service';

describe('SystemStationArtworkService', () => {
  const coverArtwork = {
    assetId: 'cover-1',
    url: 'https://cdn.example/cover.webp',
    width: 1000,
    height: 1000,
    bgColor: '123456',
    variants: {},
  };

  function service(rows: unknown[] = []) {
    return new SystemStationArtworkService(
      { systemStationArtwork: { findMany: jest.fn().mockResolvedValue(rows) } } as never,
      {} as never,
      {} as never,
    );
  }

  it('keeps a legacy cover usable when it has no Hero video yet', async () => {
    const artwork = await service([
      { stationKey: 'focus', coverArtwork, heroVideo: null },
    ]).byStationKeys(['focus']);

    expect(artwork.get('focus')).toEqual({ cover: coverArtwork });
  });

  it('rejects a non-square cover before persisting it', () => {
    const instance = service() as never as {
      cover(asset: unknown, assetId: string): unknown;
    };

    expect(() =>
      instance.cover(
        {
          id: 'cover-16x9',
          status: AssetStatus.ASSET_STATUS_READY,
          kind: AssetKind.ASSET_KIND_IMAGE,
          purpose: AssetPurpose.ASSET_PURPOSE_ARTWORK,
          publicUrl: 'https://cdn.example/cover.webp',
          width: 1600,
          height: 900,
          variants: {},
        },
        'cover-16x9',
      ),
    ).toThrow('SYSTEM_STATION_COVER_RATIO_INVALID:cover-16x9');
  });

  it('rejects a Hero video that has no generated first-frame poster', () => {
    const instance = service() as never as {
      heroVideo(asset: unknown, assetId: string): unknown;
    };

    expect(() =>
      instance.heroVideo(
        {
          id: 'hero-3x4',
          status: AssetStatus.ASSET_STATUS_READY,
          kind: AssetKind.ASSET_KIND_VIDEO,
          purpose: AssetPurpose.ASSET_PURPOSE_EDITORIAL_VIDEO,
          publicUrl: 'https://cdn.example/hero.mp4',
          width: 900,
          height: 1200,
          variants: {},
        },
        'hero-3x4',
      ),
    ).toThrow('SYSTEM_STATION_HERO_VIDEO_POSTER_MISSING:hero-3x4');
  });
});

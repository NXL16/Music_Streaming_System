import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { ClientGrpc } from '@nestjs/microservices';
import { RpcException } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { Metadata, status } from '@grpc/grpc-js';
import {
  Asset,
  AssetKind,
  AssetPurpose,
  AssetServiceClient,
  AssetStatus,
} from '@musical/shared-proto';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { ListeningService, type TasteProfile } from '../listening/listening.service';
import {
  isStationCandidateEligible,
  rankStationCandidatesForProfile,
} from './station-personalization';
import {
  StationTrackCandidate,
  StationTrackSelectionService,
  STATION_TRACK_SELECTION_VERSION,
} from './station-track-selection.service';

const STATION_TRACK_LIMIT = 30;
const STATION_REFILL_TRACK_LIMIT = 20;
const MAX_EXCLUDED_TRACKS = 1_000;
// v4 ignores near-black pixels so dark clothing never overrides the cover's
// representative base color. Older assets must be regenerated.
const SONG_STATION_ARTWORK_VERSION = 'song-station-v4';
type JsonObject = Record<string, unknown>;

type StationArtwork = {
  url: string;
  width: number;
  height: number;
  variants: JsonObject;
};

@Injectable()
export class SongStationService implements OnModuleInit {
  private assetClient!: AssetServiceClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly listeningService: ListeningService,
    private readonly stationTrackSelection: StationTrackSelectionService,
    @Inject('ASSET_SERVICE') private readonly grpcClient: ClientGrpc,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.assetClient =
      this.grpcClient.getService<AssetServiceClient>('AssetService');
  }

  async create(
    userId: string,
    songId: string,
    sourceAlbumId = '',
    stationArtworkAssetId = '',
    stationArtworkBgColor = '',
  ) {
    const normalizedUserId = userId.trim();
    const normalizedSongId = songId.trim();
    const normalizedSourceAlbumId = sourceAlbumId.trim();
    if (!normalizedUserId || !normalizedSongId) {
      this.invalidArgument('SONG_STATION_SEED_REQUIRED');
    }

    const seed = await this.prisma.recommendationResourceSnapshot.findUnique({
      where: {
        resourceType_resourceId: {
          resourceType: 'songs',
          resourceId: normalizedSongId,
        },
      },
    });
    if (!seed || !seed.artworkUrl) {
      this.notFound('SONG_STATION_SEED_NOT_FOUND');
    }

    const sourceAlbum = normalizedSourceAlbumId
      ? await this.prisma.recommendationResourceSnapshot.findUnique({
          where: {
            resourceType_resourceId: {
              resourceType: 'albums',
              resourceId: normalizedSourceAlbumId,
            },
          },
        })
      : undefined;
    if (
      normalizedSourceAlbumId &&
      (!sourceAlbum ||
        !this.hasRelationship(
          seed.relationships,
          'albums',
          normalizedSourceAlbumId,
        ))
    ) {
      this.notFound('SONG_STATION_SEED_ALBUM_NOT_FOUND');
    }
    const sourceArtworkUrl = sourceAlbum?.artworkUrl || seed.artworkUrl;
    const sourceArtworkBgColor =
      sourceAlbum?.artworkBgColor ||
      sourceAlbum?.bgColor ||
      seed.artworkBgColor ||
      seed.bgColor ||
      '2c2c2e';

    const stationId = this.stationId(normalizedSongId, normalizedSourceAlbumId);
    const existingStation =
      await this.prisma.recommendationResourceSnapshot.findUnique({
        where: {
          resourceType_resourceId: {
            resourceType: 'stations',
            resourceId: stationId,
          },
        },
        select: { raw: true, artworkBgColor: true },
      });
    const existingSongStation = this.object(
      this.object(existingStation?.raw).songStation,
    );
    // Older snapshots stored the seed-song cover as a station artwork asset.
    // Only reuse assets made by the dedicated station-artwork renderer.
    const existingArtworkAssetId =
      this.string(existingSongStation.artworkVersion) ===
        SONG_STATION_ARTWORK_VERSION &&
      this.string(existingSongStation.sourceArtworkUrl) === sourceArtworkUrl
        ? this.string(existingSongStation.artworkAssetId)
        : '';
    const trackIds = await this.trackIds(
      seed.resourceId,
      seed.genreNames,
      new Set(),
      STATION_TRACK_LIMIT,
      this.relationshipIds(seed.relationships, 'artists'),
    );
    const artworkAssetId =
      stationArtworkAssetId.trim() || existingArtworkAssetId;
    const artworkVersion = artworkAssetId ? SONG_STATION_ARTWORK_VERSION : '';
    const generatedArtwork = artworkAssetId
      ? await this.bindArtwork(stationId, artworkAssetId)
      : undefined;
    const artworkUrl = generatedArtwork?.url || sourceArtworkUrl;
    const artworkBgColor =
      stationArtworkBgColor.trim() ||
      (artworkAssetId === existingArtworkAssetId
        ? existingStation?.artworkBgColor
        : '') ||
      sourceArtworkBgColor;
    const name = `${seed.name || 'Song'} Station`;
    const description = '';
    const attributes = {
      name,
      kind: 'song-context',
      trackCount: trackIds.length,
      artwork: {
        url: artworkUrl,
        bgColor: artworkBgColor,
        width: generatedArtwork?.width || 1080,
        height: generatedArtwork?.height || 1080,
        ...(generatedArtwork?.variants
          ? { variants: generatedArtwork.variants }
          : {}),
      },
    };
    const relationships = {
      tracks: {
        href: `/me/song-stations/${stationId}/tracks`,
        data: trackIds.map((id) => ({
          id,
          type: 'songs',
          href: `/catalog/vn/songs/${id}`,
        })),
      },
    };

    const snapshot = {
      name,
      title: name,
      href: `/station/${encodeURIComponent(this.slug(name))}/${stationId}`,
      artworkUrl,
      artworkBgColor,
      bgColor: artworkBgColor,
      artworkWidth: generatedArtwork?.width || 1080,
      artworkHeight: generatedArtwork?.height || 1080,
      trackCount: trackIds.length,
      shortDescription: description,
      standardDescription: description,
      stationKind: 'song-context',
      attributes: attributes as Prisma.InputJsonObject,
      relationships,
      raw: {
        songStation: {
          visibility: 'public',
          seedSongId: normalizedSongId,
          seedAlbumId: normalizedSourceAlbumId,
          sourceArtworkUrl,
          artworkAssetId,
          artworkVersion,
          trackSelectionVersion: STATION_TRACK_SELECTION_VERSION,
        },
      },
    };

    await this.prisma.recommendationResourceSnapshot.upsert({
      where: {
        resourceType_resourceId: {
          resourceType: 'stations',
          resourceId: stationId,
        },
      },
      create: {
        resourceType: 'stations',
        resourceId: stationId,
        ...snapshot,
      },
      update: snapshot,
    });

    return {
      stationId,
      name,
      description,
      artworkUrl,
      artworkBgColor,
      trackIds,
      seedArtworkUrl: sourceArtworkUrl,
      seedSongId: normalizedSongId,
      seedAlbumId: normalizedSourceAlbumId,
      artworkReady: Boolean(generatedArtwork),
    };
  }

  async get(userId: string, stationId: string) {
    const station = await this.stationForAuthenticatedRequest(
      userId,
      stationId,
    );
    const raw = this.object(station.raw);
    const songStation = this.object(raw.songStation);
    const seedSongId = this.string(songStation.seedSongId);
    const seedAlbumId = this.string(songStation.seedAlbumId);
    const sourceArtworkUrl = this.string(songStation.sourceArtworkUrl);
    const seed =
      !sourceArtworkUrl && seedSongId
        ? await this.prisma.recommendationResourceSnapshot.findUnique({
            where: {
              resourceType_resourceId: {
                resourceType: 'songs',
                resourceId: seedSongId,
              },
            },
            select: { artworkUrl: true },
          })
        : undefined;

    const relationships = this.object(station.relationships);
    const tracks = this.object(relationships.tracks);
    const trackIds = Array.isArray(tracks.data)
      ? tracks.data
          .map((item) => this.object(item))
          .filter((item) => this.string(item.type) === 'songs')
          .map((item) => this.string(item.id))
          .filter(Boolean)
      : [];
    return {
      stationId: station.resourceId,
      name: station.name,
      description: '',
      artworkUrl: station.artworkUrl,
      artworkBgColor: station.artworkBgColor,
      trackIds,
      seedArtworkUrl: sourceArtworkUrl || seed?.artworkUrl || '',
      seedSongId,
      seedAlbumId,
      artworkReady:
        this.string(songStation.artworkVersion) ===
          SONG_STATION_ARTWORK_VERSION &&
        Boolean(this.string(songStation.sourceArtworkUrl)) &&
        Boolean(this.string(songStation.artworkAssetId)),
    };
  }

  async getTracks(
    userId: string,
    stationId: string,
    excludedSongIds: string[],
    requestedLimit: number,
  ) {
    const station = await this.stationForAuthenticatedRequest(
      userId,
      stationId,
    );
    const songStation = this.object(this.object(station.raw).songStation);
    const seedSongId = this.string(songStation.seedSongId);
    if (!seedSongId) this.notFound('SONG_STATION_SEED_NOT_FOUND');

    const seed = await this.prisma.recommendationResourceSnapshot.findUnique({
      where: {
        resourceType_resourceId: {
          resourceType: 'songs',
          resourceId: seedSongId,
        },
      },
      select: { resourceId: true, genreNames: true, relationships: true },
    });
    if (!seed) this.notFound('SONG_STATION_SEED_NOT_FOUND');

    const excluded = new Set(
      excludedSongIds
        .map((songId) => songId.trim())
        .filter(Boolean)
        .slice(0, MAX_EXCLUDED_TRACKS),
    );
    const profile = await this.listeningService.getUserTasteProfile(userId);
    return {
      trackIds: await this.trackIds(
        seed.resourceId,
        seed.genreNames,
        excluded,
        Math.min(
          STATION_REFILL_TRACK_LIMIT,
          Math.max(1, Math.floor(requestedLimit) || STATION_REFILL_TRACK_LIMIT),
        ),
        this.relationshipIds(seed.relationships, 'artists'),
        profile,
      ),
    };
  }

  private async bindArtwork(
    stationId: string,
    assetId: string,
  ): Promise<StationArtwork> {
    let asset: Asset | undefined;
    try {
      const response = await firstValueFrom(
        this.assetClient.registerAssetUsages(
          {
            ownerService: 'recommendation',
            ownerType: 'song-station',
            ownerId: stationId,
            usages: [
              {
                slot: 'artwork',
                assetId,
                expectedKind: AssetKind.ASSET_KIND_IMAGE,
                expectedPurpose: AssetPurpose.ASSET_PURPOSE_STATION_ARTWORK,
              },
            ],
          },
          this.metadata(),
        ),
      );
      asset = response.assets.find((item) => item.id === assetId);
    } catch {
      this.failedPrecondition('SONG_STATION_ARTWORK_REGISTRATION_FAILED');
    }

    if (!asset || asset.status !== AssetStatus.ASSET_STATUS_READY) {
      this.failedPrecondition('SONG_STATION_ARTWORK_NOT_READY');
    }
    if (
      asset.kind !== AssetKind.ASSET_KIND_IMAGE ||
      asset.purpose !== AssetPurpose.ASSET_PURPOSE_STATION_ARTWORK
    ) {
      this.failedPrecondition('SONG_STATION_ARTWORK_TYPE_MISMATCH');
    }

    const variants = this.object(asset.variants);
    const rendition = this.primaryRendition(variants);
    const url = rendition.url || asset.publicUrl;
    if (!url) this.failedPrecondition('SONG_STATION_ARTWORK_URL_MISSING');
    return {
      url,
      width: rendition.width || asset.width || 1080,
      height: rendition.height || asset.height || 1080,
      variants,
    };
  }

  private async trackIds(
    seedSongId: string,
    genreNames: string[],
    excludedSongIds = new Set<string>(),
    limit = STATION_TRACK_LIMIT,
    seedArtistIds: string[] = [],
    profile?: TasteProfile,
  ) {
    const includeSeed = !excludedSongIds.has(seedSongId);
    const seedSlots = includeSeed ? 1 : 0;
    const candidateLimit = Math.max(0, limit - seedSlots);
    if (candidateLimit === 0) return includeSeed ? [seedSongId] : [];

    const where = {
      resourceType: 'songs',
      resourceId: { notIn: [...excludedSongIds] },
    };
    // Keep the broad catalog fallback bounded, but retrieve same-genre songs
    // independently so an older seed is not matched only against recent music.
    const [catalog, genreCatalog] = await Promise.all([
      this.prisma.recommendationResourceSnapshot.findMany({
        where,
        select: {
          resourceId: true,
          artistName: true,
          genreNames: true,
          attributes: true,
          relationships: true,
        },
        take: 500,
        orderBy: [{ releaseDate: 'desc' }, { resourceId: 'asc' }],
      }),
      genreNames.length
        ? this.prisma.recommendationResourceSnapshot.findMany({
            where: { ...where, genreNames: { hasSome: genreNames } },
            select: {
              resourceId: true,
              artistName: true,
              genreNames: true,
              attributes: true,
              relationships: true,
            },
            take: 500,
            orderBy: [{ releaseDate: 'desc' }, { resourceId: 'asc' }],
          })
        : Promise.resolve([]),
    ]);
    const candidates: StationTrackCandidate[] = rankStationCandidatesForProfile(
      catalog,
      profile,
    )
      .filter((song) => isStationCandidateEligible(song, profile))
      .map((song) => ({
        id: song.resourceId,
        artistIds: this.relationshipIds(song.relationships, 'artists'),
      }));
    const genreSet = new Set(genreNames);
    const sameGenre = rankStationCandidatesForProfile(genreCatalog, profile)
      .filter(
        (song) =>
          isStationCandidateEligible(song, profile) &&
          song.genreNames.some((genre) => genreSet.has(genre)),
      )
      .map((song) => ({
        id: song.resourceId,
        artistIds: this.relationshipIds(song.relationships, 'artists'),
      }));
    const audioCandidates = await this.audioCandidates(
      [seedSongId],
      excludedSongIds,
      profile,
    );
    return this.stationTrackSelection.select({
      initialTrackIds: includeSeed ? [seedSongId] : [],
      initialCandidates: [
        { id: seedSongId, artistIds: seedArtistIds },
      ],
      candidateTiers: [audioCandidates, sameGenre, candidates],
      excludedSongIds,
      limit,
    });
  }

  private async audioCandidates(
    seedSongIds: string[],
    excludedSongIds: ReadonlySet<string>,
    profile?: TasteProfile,
  ): Promise<StationTrackCandidate[]> {
    const ids = await this.stationTrackSelection.audioCandidateIds(seedSongIds);
    if (!ids.length) return [];
    const songs = await this.prisma.recommendationResourceSnapshot.findMany({
      where: {
        resourceType: 'songs',
        resourceId: { in: ids.filter((id) => !excludedSongIds.has(id)) },
      },
      select: { resourceId: true, relationships: true },
    });
    const byId = new Map(songs.map((song) => [song.resourceId, song]));
    return ids.flatMap((id) => {
      const song = byId.get(id);
      return song && isStationCandidateEligible(song, profile)
        ? [{ id, artistIds: this.relationshipIds(song.relationships, 'artists') }]
        : [];
    });
  }

  private async stationForAuthenticatedRequest(
    userId: string,
    stationId: string,
  ) {
    const normalizedUserId = userId.trim();
    const normalizedStationId = stationId.trim();
    if (
      !normalizedUserId ||
      !/^song-station-[a-f0-9]{32}$/.test(normalizedStationId)
    ) {
      this.invalidArgument('SONG_STATION_ID_INVALID');
    }
    const station = await this.prisma.recommendationResourceSnapshot.findUnique(
      {
        where: {
          resourceType_resourceId: {
            resourceType: 'stations',
            resourceId: normalizedStationId,
          },
        },
      },
    );
    if (
      !station ||
      station.stationKind !== 'song-context' ||
      this.string(
        this.object(this.object(station.raw).songStation).visibility,
      ) !== 'public'
    ) {
      this.notFound('SONG_STATION_NOT_FOUND');
    }
    return station;
  }

  private stationId(songId: string, sourceAlbumId: string) {
    const digest = createHash('sha256')
      // Album remains part of the identity so a Single never shares artwork
      // with the same recording played from a larger release.
      .update(sourceAlbumId ? `${songId}:${sourceAlbumId}` : songId)
      .digest('hex');
    return `song-station-${digest.slice(0, 32)}`;
  }

  private slug(value: string) {
    return (
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'station'
    );
  }

  private primaryRendition(variants: JsonObject) {
    const renditions = Array.isArray(variants.renditions)
      ? variants.renditions.map((item) => this.object(item))
      : [];
    const primary = renditions
      .filter((item) => this.string(item.url))
      .sort((left, right) => this.number(right.width) - this.number(left.width))
      .at(0);
    return {
      url: primary ? this.string(primary.url) : '',
      width: primary ? this.number(primary.width) : 0,
      height: primary ? this.number(primary.height) : 0,
    };
  }

  private metadata(): Metadata {
    const metadata = new Metadata();
    metadata.set(
      'x-internal-token',
      this.config.getOrThrow<string>('INTERNAL_GRPC_TOKEN'),
    );
    return metadata;
  }

  private object(value: unknown): JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as JsonObject)
      : {};
  }

  private hasRelationship(
    relationships: Prisma.JsonValue | null,
    relationship: string,
    resourceId: string,
  ): boolean {
    const relation = this.object(this.object(relationships)[relationship]);
    const data = Array.isArray(relation.data) ? relation.data : [];
    return data.some(
      (item) => this.string(this.object(item).id) === resourceId,
    );
  }

  private relationshipIds(
    relationships: Prisma.JsonValue | null,
    relationship: string,
  ): string[] {
    const relation = this.object(this.object(relationships)[relationship]);
    const data = Array.isArray(relation.data) ? relation.data : [];
    return data
      .map((item) => this.string(this.object(item).id))
      .filter(Boolean);
  }

  private string(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private number(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private invalidArgument(message: string): never {
    throw new RpcException({ code: status.INVALID_ARGUMENT, message });
  }

  private notFound(message: string): never {
    throw new RpcException({ code: status.NOT_FOUND, message });
  }

  private failedPrecondition(message: string): never {
    throw new RpcException({ code: status.FAILED_PRECONDITION, message });
  }
}

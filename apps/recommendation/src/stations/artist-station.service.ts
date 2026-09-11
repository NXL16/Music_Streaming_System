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
import { CatalogSynchronizationService } from '../recommendations/catalog-synchronization.service';

const TRACK_LIMIT = 30;
const REFILL_LIMIT = 20;
const MAX_EXCLUDED = 1_000;
const ARTIST_TRACK_CANDIDATES = 500;
// v4 makes all three circles come from artists actually present in the
// station tracklist and diversifies secondary artists by the seed artist.
const SIMILAR_ARTIST_ARTWORK_VERSION = 'artist-station-v4';
const ARTIST_PLAY_ARTWORK_VERSION = 'artist-play-station-v1';
type JsonObject = Record<string, unknown>;

@Injectable()
export class ArtistStationService implements OnModuleInit {
  private assetClient!: AssetServiceClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogSynchronizationService: CatalogSynchronizationService,
    @Inject('ASSET_SERVICE') private readonly grpcClient: ClientGrpc,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.assetClient =
      this.grpcClient.getService<AssetServiceClient>('AssetService');
  }

  async create(
    userId: string,
    artistId: string,
    artworkAssetId = '',
    artworkBgColor = '',
    artistOnly = false,
  ) {
    if (!userId.trim()) this.invalid('ARTIST_STATION_SEED_REQUIRED');
    return this.ensureCanonical(
      artistId,
      artworkAssetId,
      artworkBgColor,
      artistOnly,
    );
  }

  /** Ensures the public Station identified solely by its seed artist exists. */
  async ensureCanonical(
    artistId: string,
    artworkAssetId = '',
    artworkBgColor = '',
    artistOnly = false,
  ) {
    const seedArtistId = artistId.trim();
    if (!seedArtistId) this.invalid('ARTIST_STATION_SEED_REQUIRED');
    const artist = await this.artist(seedArtistId);
    const stationId = this.stationId(seedArtistId, artistOnly);
    const artworkVersion = artistOnly
      ? ARTIST_PLAY_ARTWORK_VERSION
      : SIMILAR_ARTIST_ARTWORK_VERSION;
    const existing =
      await this.prisma.recommendationResourceSnapshot.findUnique({
        where: {
          resourceType_resourceId: {
            resourceType: 'stations',
            resourceId: stationId,
          },
        },
        select: { raw: true, artworkBgColor: true },
      });
    const prior = this.object(this.object(existing?.raw).artistStation);
    const storedAssetId =
      this.string(prior.artworkVersion) === artworkVersion
        ? this.string(prior.artworkAssetId)
        : '';
    const assetId = artworkAssetId.trim() || storedAssetId;
    const boundArtwork = assetId
      ? await this.bindArtwork(stationId, assetId)
      : undefined;
    const trackIds = await this.initialTrackIds(seedArtistId, artistOnly);
    const featured = artistOnly
      ? { ids: [], urls: [] as string[] }
      : await this.featuredArtists(trackIds, seedArtistId);
    const backgroundColor =
      artworkBgColor.trim() ||
      (assetId === storedAssetId ? existing?.artworkBgColor : '') ||
      artist.artworkBgColor ||
      artist.bgColor ||
      '808080';
    const name = artistOnly
      ? artist.name || 'Artist'
      : `${artist.name || 'Artist'} & Similar Artists`;
    const artworkUrl = boundArtwork?.url || artist.artworkUrl || '';
    const attributes = {
      name,
      kind: artistOnly ? 'artist-play-context' : 'artist-context',
      stationArtworkReady: Boolean(boundArtwork),
      artwork: {
        url: artworkUrl,
        bgColor: backgroundColor,
        width: boundArtwork?.width || artist.artworkWidth || 1080,
        height: boundArtwork?.height || artist.artworkHeight || 1080,
        ...(boundArtwork?.variants ? { variants: boundArtwork.variants } : {}),
      },
    };
    const snapshot = {
      name,
      title: name,
      href: `/station/${encodeURIComponent(this.slug(name))}/${stationId}`,
      artworkUrl,
      artworkBgColor: backgroundColor,
      bgColor: backgroundColor,
      artworkWidth: boundArtwork?.width || artist.artworkWidth || 1080,
      artworkHeight: boundArtwork?.height || artist.artworkHeight || 1080,
      shortDescription: '',
      standardDescription: '',
      stationKind: artistOnly ? 'artist-play-context' : 'artist-context',
      attributes: attributes as Prisma.InputJsonObject,
      relationships: {
        tracks: {
          href: `/me/artist-stations/${stationId}/tracks`,
          data: trackIds.map((id) => ({
            id,
            type: 'songs',
            href: `/catalog/vn/songs/${id}`,
          })),
        },
      },
      raw: {
        artistStation: {
          visibility: 'public',
          seedArtistId,
          primaryArtistArtworkUrl: artist.artworkUrl || '',
          featuredArtistArtworkUrls: featured.urls,
          featuredArtistIds: featured.ids,
          artworkAssetId: assetId,
          artworkVersion: assetId ? artworkVersion : '',
          artistOnly,
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
      create: { resourceType: 'stations', resourceId: stationId, ...snapshot },
      update: snapshot,
    });
    return {
      stationId,
      name,
      description: '',
      artworkUrl,
      artworkBgColor: backgroundColor,
      trackIds,
      featuredArtistArtworkUrls: [
        artist.artworkUrl || '',
        ...featured.urls,
      ].filter(Boolean),
      featuredArtistIds: [seedArtistId, ...featured.ids],
      artworkReady: Boolean(boundArtwork),
      seedArtistId,
      artistOnly,
    };
  }

  canonicalStationId(artistId: string): string {
    return this.stationId(artistId.trim());
  }

  async get(userId: string, stationId: string) {
    const station = await this.stationForAuthenticatedRequest(
      userId,
      stationId,
    );
    const raw = this.object(this.object(station.raw).artistStation);
    const tracks = this.object(this.object(station.relationships).tracks);
    const trackIds = Array.isArray(tracks.data)
      ? tracks.data
          .map((item) => this.string(this.object(item).id))
          .filter(Boolean)
      : [];
    const primaryArtistArtworkUrl = this.string(raw.primaryArtistArtworkUrl);
    const secondaryArtistArtworkUrls = Array.isArray(
      raw.featuredArtistArtworkUrls,
    )
      ? raw.featuredArtistArtworkUrls
          .map((value) => this.string(value))
          .filter(Boolean)
      : [];
    return {
      stationId: station.resourceId,
      name: station.name,
      description: '',
      artworkUrl: station.artworkUrl,
      artworkBgColor: station.artworkBgColor,
      trackIds,
      // The primary artist is persisted separately because it is also the
      // unrendered Station fallback. Rebuild the renderer input exactly as
      // create() returned it: primary plus two secondary artists.
      featuredArtistArtworkUrls: [
        primaryArtistArtworkUrl,
        ...secondaryArtistArtworkUrls,
      ].filter(Boolean),
      featuredArtistIds: [
        this.string(raw.seedArtistId),
        ...(Array.isArray(raw.featuredArtistIds)
          ? raw.featuredArtistIds
              .map((value) => this.string(value))
              .filter(Boolean)
          : []),
      ].filter(Boolean),
      artworkReady:
        this.string(raw.artworkVersion) ===
          (this.boolean(raw.artistOnly)
            ? ARTIST_PLAY_ARTWORK_VERSION
            : SIMILAR_ARTIST_ARTWORK_VERSION) &&
        Boolean(this.string(raw.artworkAssetId)),
      seedArtistId: this.string(raw.seedArtistId),
      artistOnly: this.boolean(raw.artistOnly),
    };
  }

  async getTracks(
    userId: string,
    stationId: string,
    excludedSongIds: string[],
    limit: number,
  ) {
    const station = await this.stationForAuthenticatedRequest(
      userId,
      stationId,
    );
    const seedArtistId = this.string(
      this.object(this.object(station.raw).artistStation).seedArtistId,
    );
    if (!seedArtistId) this.notFound('ARTIST_STATION_SEED_NOT_FOUND');
    return {
      trackIds: await this.trackIds(
        seedArtistId,
        new Set(
          excludedSongIds
            .map((id) => id.trim())
            .filter(Boolean)
            .slice(0, MAX_EXCLUDED),
        ),
        Math.min(REFILL_LIMIT, Math.max(1, Math.floor(limit) || REFILL_LIMIT)),
        this.boolean(this.object(this.object(station.raw).artistStation).artistOnly),
      ),
    };
  }

  private async artist(artistId: string) {
    const artist = await this.findArtist(artistId);
    if (artist?.artworkUrl) return artist;

    await this.catalogSynchronizationService.ensureFreshCatalog();
    const synchronizedArtist = await this.findArtist(artistId);
    if (!synchronizedArtist?.artworkUrl) {
      this.notFound('ARTIST_STATION_SEED_NOT_FOUND');
    }
    return synchronizedArtist;
  }

  private findArtist(artistId: string) {
    return this.prisma.recommendationResourceSnapshot.findUnique({
      where: {
        resourceType_resourceId: {
          resourceType: 'artists',
          resourceId: artistId,
        },
      },
    });
  }

  private async initialTrackIds(
    artistId: string,
    artistOnly = false,
  ): Promise<string[]> {
    let trackIds = await this.trackIds(artistId, new Set(), TRACK_LIMIT, artistOnly);
    if (trackIds.length) return trackIds;

    // The Song catalog can be newer than Recommendation's denormalized read
    // model. Synchronize only on this stale-read miss, never on every click.
    await this.catalogSynchronizationService.ensureFreshCatalog();
    trackIds = await this.trackIds(artistId, new Set(), TRACK_LIMIT, artistOnly);
    if (!trackIds.length) {
      this.notFound('ARTIST_STATION_SEED_TRACK_NOT_FOUND');
    }
    return trackIds;
  }

  private async trackIds(
    artistId: string,
    excluded = new Set<string>(),
    limit = TRACK_LIMIT,
    artistOnly = false,
  ): Promise<string[]> {
    const artist = await this.artist(artistId);
    const ownCandidates =
      await this.prisma.recommendationResourceSnapshot.findMany({
        // Relationship IDs disambiguate artists that share a display name.
        where: { resourceType: 'songs', artistNames: { has: artist.name } },
        select: { resourceId: true, relationships: true },
        orderBy: [{ releaseDate: 'desc' }, { resourceId: 'asc' }],
        take: ARTIST_TRACK_CANDIDATES,
      });
    if (artistOnly) {
      return ownCandidates
        .filter(
          (song) =>
            !excluded.has(song.resourceId) &&
            this.hasRelationship(song.relationships, 'artists', artistId),
        )
        .slice(0, limit)
        .map((song) => song.resourceId);
    }
    const seedSong = ownCandidates.find(
      (song) =>
        !excluded.has(song.resourceId) &&
        this.hasRelationship(song.relationships, 'artists', artistId),
    );
    // Never start an Artist Station with a same-genre fallback: its first
    // audible track must belong to the artist selected in the menu.
    if (!seedSong && excluded.size === 0) return [];
    const selected = seedSong ? [seedSong.resourceId] : [];
    const used = new Set([...excluded, ...selected]);
    const genreCandidates = artist.genreNames.length
      ? this.rankCandidates(
          await this.prisma.recommendationResourceSnapshot.findMany({
            where: {
              resourceType: 'songs',
              resourceId: { notIn: [...used] },
              genreNames: { hasSome: artist.genreNames },
            },
            select: { resourceId: true, relationships: true },
            orderBy: [{ releaseDate: 'desc' }, { resourceId: 'asc' }],
            take: ARTIST_TRACK_CANDIDATES,
          }),
          artistId,
        )
      : [];
    const genreSelection = await this.selectStationCandidates(
      genreCandidates,
      artistId,
      limit - selected.length,
    );
    selected.push(...genreSelection.trackIds);
    if (selected.length >= limit) return selected;
    const fallback = this.rankCandidates(
      await this.prisma.recommendationResourceSnapshot.findMany({
        where: {
          resourceType: 'songs',
          resourceId: { notIn: [...excluded, ...selected] },
        },
        select: { resourceId: true, relationships: true },
        orderBy: [{ releaseDate: 'desc' }, { resourceId: 'asc' }],
        take: ARTIST_TRACK_CANDIDATES,
      }),
      artistId,
    );
    const fallbackSelection = await this.selectStationCandidates(
      fallback,
      artistId,
      limit - selected.length,
      genreSelection.featuredArtistIds,
    );
    return [...selected, ...fallbackSelection.trackIds];
  }

  private async selectStationCandidates(
    candidates: Array<{
      resourceId: string;
      relationships: Prisma.JsonValue | null;
    }>,
    seedArtistId: string,
    limit: number,
    existingFeaturedArtistIds = new Set<string>(),
  ): Promise<{ trackIds: string[]; featuredArtistIds: Set<string> }> {
    const selected: string[] = [];
    const featured = new Set(existingFeaturedArtistIds);
    const eligibleFeaturedArtistIds = await this.artistIdsWithArtwork(
      candidates.flatMap((song) =>
        this.relationshipIds(song.relationships, 'artists'),
      ),
    );
    // Give two distinct artists that can actually be rendered a place in the
    // tracklist first. The later ranking still selects the two most frequent.
    for (const song of candidates) {
      if (featured.size >= 2) break;
      const artists = this.relationshipIds(song.relationships, 'artists');
      const artist = artists.find(
        (id) =>
          id !== seedArtistId &&
          eligibleFeaturedArtistIds.has(id) &&
          !featured.has(id),
      );
      if (!artist) continue;
      featured.add(artist);
      selected.push(song.resourceId);
      if (featured.size >= 2 || selected.length === limit) break;
    }
    for (const song of candidates) {
      if (selected.length === limit) break;
      if (!selected.includes(song.resourceId)) selected.push(song.resourceId);
    }
    return { trackIds: selected, featuredArtistIds: featured };
  }

  private rankCandidates<T extends { resourceId: string }>(
    candidates: T[],
    seedArtistId: string,
  ): T[] {
    // The candidate pool is still genre-filtered. This stable seed-specific
    // ordering prevents every artist in that genre from receiving the same
    // two secondary portraits while keeping reopens reproducible.
    return candidates
      .map((candidate) => ({
        candidate,
        rank: this.candidateRank(seedArtistId, candidate.resourceId),
      }))
      .sort((left, right) => left.rank.localeCompare(right.rank))
      .map(({ candidate }) => candidate);
  }

  private candidateRank(seedArtistId: string, songId: string): string {
    return createHash('sha256')
      .update(`${seedArtistId}:${songId}`)
      .digest('hex');
  }

  private async artistIdsWithArtwork(
    artistIds: string[],
  ): Promise<Set<string>> {
    const uniqueIds = [...new Set(artistIds.filter(Boolean))];
    if (!uniqueIds.length) return new Set();
    const artists = await this.prisma.recommendationResourceSnapshot.findMany({
      where: {
        resourceType: 'artists',
        resourceId: { in: uniqueIds },
        artworkUrl: { not: '' },
      },
      select: { resourceId: true },
    });
    return new Set(artists.map((artist) => artist.resourceId));
  }

  private async featuredArtists(trackIds: string[], seedArtistId: string) {
    const songs = await this.prisma.recommendationResourceSnapshot.findMany({
      where: { resourceType: 'songs', resourceId: { in: trackIds } },
      select: { relationships: true },
    });
    const counts = new Map<string, number>();
    for (const song of songs)
      for (const id of this.relationshipIds(song.relationships, 'artists'))
        if (id !== seedArtistId) counts.set(id, (counts.get(id) || 0) + 1);
    const rankedIds = [...counts]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([id]) => id);
    if (!rankedIds.length) return { ids: [], urls: [] as string[] };
    const artists = await this.prisma.recommendationResourceSnapshot.findMany({
      where: {
        resourceType: 'artists',
        resourceId: { in: rankedIds },
        artworkUrl: { not: '' },
      },
      select: { resourceId: true, artworkUrl: true },
    });
    const byId = new Map(
      artists.map((artist) => [artist.resourceId, artist.artworkUrl]),
    );
    const resolved = rankedIds
      .flatMap((id) => {
        const url = byId.get(id);
        return url ? [{ id, url }] : [];
      })
      .slice(0, 2);
    return {
      ids: resolved.map((artist) => artist.id),
      urls: resolved.map((artist) => artist.url),
    };
  }

  private async bindArtwork(stationId: string, assetId: string) {
    let asset: Asset | undefined;
    try {
      const response = await firstValueFrom(
        this.assetClient.registerAssetUsages(
          {
            ownerService: 'recommendation',
            ownerType: 'artist-station',
            ownerId: stationId,
            usages: [
              {
                slot: 'artwork',
                assetId,
                expectedKind: AssetKind.ASSET_KIND_IMAGE,
                expectedPurpose: AssetPurpose.ASSET_PURPOSE_ARTWORK,
              },
            ],
          },
          this.metadata(),
        ),
      );
      asset = response.assets.find((item) => item.id === assetId);
    } catch {
      this.precondition('ARTIST_STATION_ARTWORK_REGISTRATION_FAILED');
    }
    if (
      !asset ||
      asset.status !== AssetStatus.ASSET_STATUS_READY ||
      asset.kind !== AssetKind.ASSET_KIND_IMAGE ||
      asset.purpose !== AssetPurpose.ASSET_PURPOSE_ARTWORK
    )
      this.precondition('ARTIST_STATION_ARTWORK_NOT_READY');
    const variants = this.object(asset.variants);
    const renditions = Array.isArray(variants.renditions)
      ? variants.renditions.map((item) => this.object(item))
      : [];
    const primary = renditions
      .filter((item) => this.string(item.url))
      .sort((a, b) => this.number(b.width) - this.number(a.width))[0];
    const url = this.string(primary?.url) || asset.publicUrl;
    if (!url) this.precondition('ARTIST_STATION_ARTWORK_URL_MISSING');
    return {
      url,
      width: this.number(primary?.width) || asset.width || 1080,
      height: this.number(primary?.height) || asset.height || 1080,
      variants,
    };
  }

  private async stationForAuthenticatedRequest(
    userId: string,
    stationId: string,
  ) {
    if (
      !userId.trim() ||
      !/^(artist|artist-play)-station-[a-f0-9]{32}$/.test(stationId.trim())
    )
      this.invalid('ARTIST_STATION_ID_INVALID');
    const station = await this.prisma.recommendationResourceSnapshot.findUnique(
      {
        where: {
          resourceType_resourceId: {
            resourceType: 'stations',
            resourceId: stationId.trim(),
          },
        },
      },
    );
    if (
      !station ||
      !['artist-context', 'artist-play-context'].includes(
        station.stationKind,
      ) ||
      this.string(
        this.object(this.object(station.raw).artistStation).visibility,
      ) !== 'public'
    )
      this.notFound('ARTIST_STATION_NOT_FOUND');
    return station;
  }
  private stationId(artistId: string, artistOnly = false) {
    const prefix = artistOnly ? 'artist-play-station' : 'artist-station';
    return `${prefix}-${createHash('sha256').update(artistId).digest('hex').slice(0, 32)}`;
  }
  private slug(value: string) {
    return (
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'station'
    );
  }
  private metadata() {
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
  private string(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }
  private number(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }
  private boolean(value: unknown): boolean {
    return value === true;
  }
  private relationshipIds(
    value: Prisma.JsonValue | null,
    relationship: string,
  ) {
    const data = this.object(this.object(value)[relationship]).data;
    return Array.isArray(data)
      ? data.map((item) => this.string(this.object(item).id)).filter(Boolean)
      : [];
  }
  private hasRelationship(
    value: Prisma.JsonValue | null,
    relationship: string,
    id: string,
  ) {
    return this.relationshipIds(value, relationship).includes(id);
  }
  private invalid(message: string): never {
    throw new RpcException({ code: status.INVALID_ARGUMENT, message });
  }
  private notFound(message: string): never {
    throw new RpcException({ code: status.NOT_FOUND, message });
  }
  private precondition(message: string): never {
    throw new RpcException({ code: status.FAILED_PRECONDITION, message });
  }
}

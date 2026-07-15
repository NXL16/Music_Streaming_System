import { Injectable } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { randomUUID } from 'node:crypto';
import {
  CatalogDraftDetail,
  CatalogDraftInfo,
  CatalogDraftStatus,
  CatalogResponse,
  DeleteCatalogDraftRequest,
  DeleteCatalogDraftResponse,
  GetCatalogDraftRequest,
  ListCatalogDraftsRequest,
  ListCatalogDraftsResponse,
  PublishCatalogDraftRequest,
  SaveCatalogAlbumDraftRequest,
  SaveCatalogArtistDraftRequest,
  SaveCatalogPlaylistDraftRequest,
  SaveCatalogSongDraftRequest,
  SongStatus,
} from '@musical/shared-proto';
import { PrismaService } from '../database/prisma.service';
import {
  CatalogDraft,
  CatalogDraftStatus as PrismaDraftStatus,
  Prisma,
} from '../generated/prisma/client';
import { CatalogService } from './catalog.service';
import { CatalogAssetsService } from './catalog-assets.service';

const RESOURCE_TYPES = {
  ARTIST: 'artists',
  SONG: 'songs',
  ALBUM: 'albums',
  PLAYLIST: 'playlists',
} as const;

const MAX_DRAFTS_PER_PAGE = 100;
const MAX_TRACKS = 1_000;
const MAX_CREDITS = 100;
const MAX_OFFERS = 50;
const MAX_RICH_METADATA_BYTES = 256 * 1024;

type JsonObject = Record<string, unknown>;

@Injectable()
export class CatalogAuthoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogService: CatalogService,
    private readonly catalogAssetsService: CatalogAssetsService,
  ) { }

  saveArtistDraft(
    request: SaveCatalogArtistDraftRequest,
  ): Promise<CatalogDraftInfo> {
    const genreNames = this.list(request.genreNames);

    this.validateCommon(request.storefront, request.actorUserId);
    this.requireText(request.name, 'name', 255);
    this.validateStringArray(genreNames, 'genre_names', 128);
    this.rejectDirectAssetMetadata(request.artwork, 'artwork');
    this.rejectDirectAssetMetadata(request.editorialVideo, 'editorial_video');

    return this.saveDraft(
      RESOURCE_TYPES.ARTIST,
      request.resourceId || randomUUID(),
      request.storefront,
      request.actorUserId,
      this.json({
        name: request.name.trim(),
        url: (request.url || '').trim(),
        artworkAssetId: (request.artworkAssetId || '').trim(),
        editorialVideoAssetId: request.editorialVideoAssetId?.trim() ?? '',
        editorialVideo: this.unwrapStruct(request.editorialVideo),
        genreNames,
      }),
    );
  }

  saveSongDraft(
    request: SaveCatalogSongDraftRequest,
  ): Promise<CatalogDraftInfo> {
    const artistIds = this.list(request.artistIds);
    const audioTraits = this.list(request.audioTraits);
    const composerIds = this.list(request.composerIds);
    const genreNames = this.list(request.genreNames);
    const offers = this.list(request.offers);

    this.validateCommon(request.storefront, request.actorUserId);
    this.requireText(request.resourceId, 'resource_id', 128);
    this.requireText(request.name, 'name', 255);
    this.validateCredits(artistIds, composerIds);
    this.validateStringArray(audioTraits, 'audio_traits', 64);
    this.validateStringArray(genreNames, 'genre_names', 128);
    this.validateDate(request.releaseDate, 'release_date');
    this.rejectDirectAssetMetadata(request.artwork, 'artwork');
    this.validateRichMetadata(request.editorialArtwork, 'editorial_artwork');
    this.validateRichMetadata(
      request.extendedAssetUrls,
      'extended_asset_urls',
    );
    this.validateOffers(offers);

    return this.saveDraft(
      RESOURCE_TYPES.SONG,
      request.resourceId,
      request.storefront,
      request.actorUserId,
      this.json({
        name: request.name.trim(),
        albumName: (request.albumName || '').trim(),
        artistName: (request.artistName || '').trim(),
        artworkAssetId: (request.artworkAssetId || '').trim(),
        editorialArtworkAssetId:
          (request.editorialArtworkAssetId || '').trim(),
        editorialArtwork: this.unwrapStruct(request.editorialArtwork),
        extendedAssetUrls: this.unwrapStruct(request.extendedAssetUrls),
        offers: offers.map((offer) => this.unwrapStruct(offer) ?? {}),
        audioLocale: (request.audioLocale || '').trim(),
        audioTraits,
        composerName: (request.composerName || '').trim(),
        contentRating: (request.contentRating || '').trim(),
        discNumber: Math.max(1, request.discNumber || 1),
        genreNames,
        hasLyrics: request.hasLyrics,
        hasTimeSyncedLyrics: request.hasTimeSyncedLyrics,
        isHighResolutionMaster: request.isHighResolutionMaster,
        isStudioMastered: request.isStudioMastered,
        isVocalAttenuationAllowed: request.isVocalAttenuationAllowed,
        isrc: (request.isrc || '').trim() || null,
        previewUrl: (request.previewUrl || '').trim(),
        releaseDate: (request.releaseDate || '').trim() || null,
        trackNumber: Math.max(0, request.trackNumber),
        url: (request.url || '').trim(),
        artistIds: this.unique(artistIds),
        composerIds: this.unique(composerIds),
      }),
    );
  }

  saveAlbumDraft(
    request: SaveCatalogAlbumDraftRequest,
  ): Promise<CatalogDraftInfo> {
    const artistIds = this.list(request.artistIds);
    const audioTraits = this.list(request.audioTraits);
    const genreNames = this.list(request.genreNames);
    const offers = this.list(request.offers);
    const tracks = this.list(request.tracks);

    this.validateCommon(request.storefront, request.actorUserId);
    this.requireText(request.name, 'name', 255);
    this.validateAssignments(tracks);
    this.validateStringArray(artistIds, 'artist_ids', 128);
    this.validateStringArray(audioTraits, 'audio_traits', 64);
    this.validateStringArray(genreNames, 'genre_names', 128);
    this.validateDate(request.releaseDate, 'release_date');
    this.rejectDirectAssetMetadata(request.artwork, 'artwork');
    this.validateRichMetadata(request.editorialArtwork, 'editorial_artwork');
    this.validateRichMetadata(request.editorialNotes, 'editorial_notes');
    this.rejectDirectAssetMetadata(
      request.editorialVideo,
      'editorial_video',
    );
    this.validateOffers(offers);

    return this.saveDraft(
      RESOURCE_TYPES.ALBUM,
      request.resourceId || randomUUID(),
      request.storefront,
      request.actorUserId,
      this.json({
        name: request.name.trim(),
        artistName: (request.artistName || '').trim(),
        artworkAssetId: (request.artworkAssetId || '').trim(),
        editorialArtworkAssetId:
          (request.editorialArtworkAssetId || '').trim(),
        editorialVideoAssetId: (request.editorialVideoAssetId || '').trim(),
        editorialArtwork: this.unwrapStruct(request.editorialArtwork),
        editorialNotes: this.unwrapStruct(request.editorialNotes),
        offers: offers.map((offer) => this.unwrapStruct(offer) ?? {}),
        audioTraits,
        contentRating: (request.contentRating || '').trim(),
        copyright: (request.copyright || '').trim(),
        genreNames,
        isCompilation: request.isCompilation,
        isComplete: request.isComplete,
        isStudioMastered: request.isStudioMastered,
        isPrerelease: request.isPrerelease,
        isSingle: request.isSingle,
        recordLabel: (request.recordLabel || '').trim(),
        releaseDate: (request.releaseDate || '').trim() || null,
        upc: (request.upc || '').trim(),
        url: (request.url || '').trim(),
        artistIds: this.unique(artistIds),
        tracks,
      }),
    );
  }

  savePlaylistDraft(
    request: SaveCatalogPlaylistDraftRequest,
  ): Promise<CatalogDraftInfo> {
    const audioTraits = this.list(request.audioTraits);
    const artistNames = this.list(request.artistNames);
    const tracks = this.list(request.tracks);

    this.validateCommon(request.storefront, request.actorUserId);
    this.requireText(request.name, 'name', 255);
    this.validateAssignments(tracks);
    this.validateStringArray(artistNames, 'artist_names', 255);
    this.validateStringArray(audioTraits, 'audio_traits', 64);
    this.rejectDirectAssetMetadata(request.artwork, 'artwork');
    this.validateRichMetadata(request.editorialArtwork, 'editorial_artwork');
    this.validateRichMetadata(request.editorialNotes, 'editorial_notes');
    this.rejectDirectAssetMetadata(
      request.editorialVideo,
      'editorial_video',
    );
    this.validateRichMetadata(
      request.plainEditorialCard,
      'plain_editorial_card',
    );
    this.validateRichMetadata(
      request.plainEditorialNotes,
      'plain_editorial_notes',
    );

    return this.saveDraft(
      RESOURCE_TYPES.PLAYLIST,
      request.resourceId || randomUUID(),
      request.storefront,
      request.actorUserId,
      this.json({
        name: request.name.trim(),
        curatorName: (request.curatorName || '').trim(),
        descriptionShort: (request.descriptionShort || '').trim(),
        descriptionStandard: (request.descriptionStandard || '').trim(),
        artworkAssetId: (request.artworkAssetId || '').trim(),
        editorialArtworkAssetId:
          (request.editorialArtworkAssetId || '').trim(),
        editorialVideoAssetId: (request.editorialVideoAssetId || '').trim(),
        editorialArtwork: this.unwrapStruct(request.editorialArtwork),
        editorialNotes: this.unwrapStruct(request.editorialNotes),
        plainEditorialCard: this.unwrapStruct(request.plainEditorialCard),
        plainEditorialNotes: this.unwrapStruct(request.plainEditorialNotes),
        artistNames,
        audioTraits,
        editorialPlaylistKind: (request.editorialPlaylistKind || '').trim(),
        hasCollaboration: request.hasCollaboration,
        isChart: request.isChart,
        playlistType: (request.playlistType || '').trim() || 'editorial',
        supportsSing: request.supportsSing,
        url: (request.url || '').trim(),
        ownerId: (request.ownerId || '').trim(),
        isPublic: request.isPublic,
        tracks,
      }),
    );
  }

  async getDraft(
    request: GetCatalogDraftRequest,
  ): Promise<CatalogDraftDetail> {
    const draft = await this.findDraft(request.draftId);
    return {
      draft: this.draftInfo(draft),
      payload: this.wrapStruct(this.object(draft.payload)),
    };
  }

  async listDrafts(
    request: ListCatalogDraftsRequest,
  ): Promise<ListCatalogDraftsResponse> {
    const limit = Math.min(
      Math.max(request.limit || 20, 1),
      MAX_DRAFTS_PER_PAGE,
    );
    const drafts = await this.prisma.catalogDraft.findMany({
      where: {
        storefront: request.storefront || undefined,
        resourceType: request.resourceType || undefined,
        status: this.prismaDraftStatus(request.status),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(request.cursor
        ? { cursor: { id: request.cursor }, skip: 1 }
        : {}),
    });
    const hasMore = drafts.length > limit;
    const page = hasMore ? drafts.slice(0, limit) : drafts;

    return {
      drafts: page.map((draft) => this.draftInfo(draft)),
      nextCursor: hasMore ? page.at(-1)?.id ?? '' : '',
      hasMore,
    };
  }

  async publishDraft(
    request: PublishCatalogDraftRequest,
  ): Promise<CatalogResponse> {
    this.requireText(request.actorUserId, 'actor_user_id', 128);
    const draft = await this.findDraft(request.draftId);
    const lockKey = `${draft.resourceType}\u001f${draft.storefront}\u001f${draft.resourceId}`;
    const resolvedAssets =
      await this.catalogAssetsService.resolveForPublish(
        draft.resourceType,
        draft.resourceId,
        this.object(draft.payload),
      );

    await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw<Array<{ lock: string | null }>>`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${lockKey}, 0)
          )::text AS "lock"
        `;

        const current = await tx.catalogDraft.findUnique({
          where: { id: draft.id },
        });
        if (!current) this.notFound('CATALOG_DRAFT_NOT_FOUND');
        if (current.version !== draft.version) {
          this.failedPrecondition('CATALOG_DRAFT_CHANGED_RETRY');
        }

        const payload = resolvedAssets.payload;
        switch (current.resourceType) {
          case RESOURCE_TYPES.ARTIST:
            await this.publishArtist(tx, current, payload);
            break;
          case RESOURCE_TYPES.SONG:
            await this.publishSong(tx, current, payload);
            break;
          case RESOURCE_TYPES.ALBUM:
            await this.publishAlbum(tx, current, payload);
            break;
          case RESOURCE_TYPES.PLAYLIST:
            await this.publishPlaylist(tx, current, payload);
            break;
          default:
            this.invalidArgument('CATALOG_RESOURCE_TYPE_UNSUPPORTED');
        }

        await tx.catalogDraft.update({
          where: { id: current.id },
          data: {
            status: PrismaDraftStatus.PUBLISHED,
            publishedAt: new Date(),
            updatedBy: request.actorUserId,
          },
        });
        await tx.catalogAssetUsageOutbox.upsert({
          where: {
            resourceType_resourceId_storefront: {
              resourceType: current.resourceType,
              resourceId: current.resourceId,
              storefront: current.storefront,
            },
          },
          create: {
            resourceType: current.resourceType,
            resourceId: current.resourceId,
            storefront: current.storefront,
            usages: this.json(resolvedAssets.usages),
          },
          update: {
            usages: this.json(resolvedAssets.usages),
            attempts: 0,
            availableAt: new Date(),
            lockedAt: null,
            lastError: '',
          },
        });
      },
      { maxWait: 10_000, timeout: 30_000 },
    );

    return this.catalogService.getResources({
      storefront: draft.storefront,
      resources: [
        { type: draft.resourceType, id: draft.resourceId },
      ],
    });
  }

  async deleteDraft(
    request: DeleteCatalogDraftRequest,
  ): Promise<DeleteCatalogDraftResponse> {
    this.requireText(request.draftId, 'draft_id', 128);
    const deleted = await this.prisma.catalogDraft.deleteMany({
      where: { id: request.draftId },
    });
    return { success: deleted.count > 0 };
  }

  private async saveDraft(
    resourceType: string,
    resourceId: string,
    storefront: string,
    actorUserId: string,
    payload: Prisma.InputJsonValue,
  ): Promise<CatalogDraftInfo> {
    this.requireText(resourceId, 'resource_id', 128);
    const draft = await this.prisma.catalogDraft.upsert({
      where: {
        resourceType_resourceId_storefront: {
          resourceType,
          resourceId,
          storefront,
        },
      },
      create: {
        resourceType,
        resourceId,
        storefront,
        payload,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
      update: {
        payload,
        status: PrismaDraftStatus.DRAFT,
        publishedAt: null,
        updatedBy: actorUserId,
        version: { increment: 1 },
      },
    });

    return this.draftInfo(draft);
  }

  private async publishArtist(
    tx: Prisma.TransactionClient,
    draft: CatalogDraft,
    payload: JsonObject,
  ): Promise<void> {
    const data = {
      storefront: draft.storefront,
      name: this.requiredString(payload.name, 'name'),
      url: this.string(payload.url),
      artworkAssetId: this.requiredString(
        payload.artworkAssetId,
        'artwork_asset_id',
      ),
      artwork: this.jsonNullable(payload.artwork),
      genreNames: this.strings(payload.genreNames),
      editorialVideoAssetId: this.string(payload.editorialVideoAssetId),
      editorialVideo: this.jsonNullable(payload.editorialVideo),
    };
    await tx.artist.upsert({
      where: { id: draft.resourceId },
      create: { id: draft.resourceId, ...data },
      update: data,
    });
  }

  private async publishSong(
    tx: Prisma.TransactionClient,
    draft: CatalogDraft,
    payload: JsonObject,
  ): Promise<void> {
    const song = await tx.song.findUnique({
      where: { id: draft.resourceId },
      select: { status: true },
    });
    if (!song) this.failedPrecondition('SONG_UPLOAD_REQUIRED');
    if (Number(song.status) !== Number(SongStatus.SONG_STATUS_READY)) {
      this.failedPrecondition('SONG_NOT_READY');
    }

    const artistIds = this.strings(payload.artistIds);
    const composerIds = this.strings(payload.composerIds);
    await this.assertArtists(tx, [...artistIds, ...composerIds], draft.storefront);

    await tx.song.update({
      where: { id: draft.resourceId },
      data: {
        isCatalog: true,
        storefront: draft.storefront,
        catalogTitle: this.requiredString(payload.name, 'name'),
        albumName: this.string(payload.albumName),
        artistName: this.string(payload.artistName),
        artworkAssetId: this.requiredString(
          payload.artworkAssetId,
          'artwork_asset_id',
        ),
        editorialArtworkAssetId: this.string(
          payload.editorialArtworkAssetId,
        ),
        artwork: this.jsonNullable(payload.artwork),
        editorialArtwork: this.jsonNullable(payload.editorialArtwork),
        extendedAssetUrls: this.jsonNullable(payload.extendedAssetUrls),
        offers: this.jsonNullable(payload.offers),
        audioLocale: this.string(payload.audioLocale),
        audioTraits: this.strings(payload.audioTraits),
        composerName: this.string(payload.composerName),
        contentRating: this.string(payload.contentRating),
        discNumber: Math.max(1, this.integer(payload.discNumber, 1)),
        genreNames: this.strings(payload.genreNames),
        hasLyrics: this.boolean(payload.hasLyrics),
        hasTimeSyncedLyrics: this.boolean(payload.hasTimeSyncedLyrics),
        isHighResolutionMaster: this.boolean(
          payload.isHighResolutionMaster,
        ),
        isStudioMastered: this.boolean(payload.isStudioMastered),
        isVocalAttenuationAllowed: this.boolean(
          payload.isVocalAttenuationAllowed,
        ),
        isrc: this.optionalString(payload.isrc),
        previewUrl: this.string(payload.previewUrl),
        releaseDate: this.date(payload.releaseDate),
        trackNumber: Math.max(0, this.integer(payload.trackNumber)),
        catalogUrl:
          this.string(payload.url) ||
          this.href(draft.storefront, RESOURCE_TYPES.SONG, draft.resourceId),
      },
    });

    await tx.songArtistCredit.deleteMany({
      where: { songId: draft.resourceId },
    });
    const credits = [
      ...artistIds.map((artistId, position) => ({
        songId: draft.resourceId,
        artistId,
        role: 'artist',
        position,
      })),
      ...composerIds.map((artistId, position) => ({
        songId: draft.resourceId,
        artistId,
        role: 'composer',
        position,
      })),
    ];
    if (credits.length) {
      await tx.songArtistCredit.createMany({ data: credits });
    }
  }

  private async publishAlbum(
    tx: Prisma.TransactionClient,
    draft: CatalogDraft,
    payload: JsonObject,
  ): Promise<void> {
    const artistName = this.string(payload.artistName);
    const artistIds = await this.resolveAlbumArtistIds(
      tx,
      draft.storefront,
      artistName,
      this.strings(payload.artistIds),
    );
    const tracks = this.assignments(payload.tracks);
    await this.assertSongs(tx, tracks.map((track) => track.songId), draft.storefront);

    const data = {
      storefront: draft.storefront,
      name: this.requiredString(payload.name, 'name'),
      artistName,
      artworkAssetId: this.requiredString(
        payload.artworkAssetId,
        'artwork_asset_id',
      ),
      editorialArtworkAssetId: this.string(
        payload.editorialArtworkAssetId,
      ),
      editorialVideoAssetId: this.string(
        payload.editorialVideoAssetId,
      ),
      artwork: this.jsonNullable(payload.artwork),
      editorialArtwork: this.jsonNullable(payload.editorialArtwork),
      editorialNotes: this.jsonNullable(payload.editorialNotes),
      editorialVideo: this.jsonNullable(payload.editorialVideo),
      offers: this.jsonNullable(payload.offers),
      audioTraits: this.strings(payload.audioTraits),
      contentRating: this.string(payload.contentRating),
      copyright: this.string(payload.copyright),
      genreNames: this.strings(payload.genreNames),
      isCompilation: this.boolean(payload.isCompilation),
      isComplete: this.boolean(payload.isComplete),
      isStudioMastered: this.boolean(payload.isStudioMastered),
      isPrerelease: this.boolean(payload.isPrerelease),
      isSingle: this.boolean(payload.isSingle),
      recordLabel: this.string(payload.recordLabel),
      releaseDate: this.date(payload.releaseDate),
      trackCount: tracks.length,
      upc: this.string(payload.upc),
      url:
        this.string(payload.url) ||
        this.href(draft.storefront, RESOURCE_TYPES.ALBUM, draft.resourceId),
    };

    await this.assertNoSemanticAlbumDuplicate(tx, draft, data, tracks);

    await tx.album.upsert({
      where: { id: draft.resourceId },
      create: { id: draft.resourceId, ...data },
      update: data,
    });
    await tx.albumArtistCredit.deleteMany({
      where: { albumId: draft.resourceId },
    });
    await tx.albumTrack.deleteMany({ where: { albumId: draft.resourceId } });
    if (artistIds.length) {
      await tx.albumArtistCredit.createMany({
        data: artistIds.map((artistId, position) => ({
          albumId: draft.resourceId,
          artistId,
          position,
        })),
      });
    }
    if (tracks.length) {
      await tx.albumTrack.createMany({
        data: tracks.map((track) => ({
          albumId: draft.resourceId,
          songId: track.songId,
          position: track.position,
          discNumber: track.discNumber,
          popularity: track.popularity,
        })),
      });
    }
  }

  /**
   * A provider can expose one release through multiple external collection
   * IDs. Resource IDs are intentionally opaque, so reject a second catalog
   * album only when its normalised metadata and full ordered song list are
   * identical to an existing release in the same storefront.
   */
  private async assertNoSemanticAlbumDuplicate(
    tx: Prisma.TransactionClient,
    draft: CatalogDraft,
    album: {
      name: string;
      artistName: string;
      releaseDate: Date | null;
      trackCount: number;
      isSingle: boolean;
    },
    tracks: Array<{ songId: string; position: number; discNumber: number }>,
  ): Promise<void> {
    // Missing date or artist metadata is too weak a signal for a hard reject.
    // The importer still catches those cases; the catalog guard remains
    // deliberately conservative to permit legitimate reissues.
    if (!album.releaseDate || !album.artistName.trim()) return;

    const candidates = await tx.album.findMany({
      where: {
        storefront: draft.storefront,
        id: { not: draft.resourceId },
        name: { equals: album.name, mode: 'insensitive' },
        artistName: { equals: album.artistName, mode: 'insensitive' },
        releaseDate: album.releaseDate,
        trackCount: album.trackCount,
        isSingle: album.isSingle,
      },
      include: {
        tracks: {
          select: { songId: true, position: true, discNumber: true },
          orderBy: [{ discNumber: 'asc' }, { position: 'asc' }],
        },
      },
    });

    const incomingFingerprint = this.albumSemanticFingerprint(
      album.name,
      album.artistName,
      album.releaseDate,
      tracks,
    );
    const duplicate = candidates.find(
      (candidate) =>
        this.albumSemanticFingerprint(
          candidate.name,
          candidate.artistName,
          candidate.releaseDate,
          candidate.tracks,
        ) === incomingFingerprint,
    );

    if (duplicate) {
      this.invalidArgument(
        `ALBUM_SEMANTIC_DUPLICATE: matches existing album ${duplicate.id}`,
      );
    }
  }

  private albumSemanticFingerprint(
    name: string,
    artistName: string,
    releaseDate: Date | null,
    tracks: Array<{ songId: string; position: number; discNumber: number }>,
  ): string {
    const orderedTracks = [...tracks]
      .sort(
        (left, right) =>
          left.discNumber - right.discNumber || left.position - right.position,
      )
      .map((track) => `${track.discNumber}:${track.position}:${track.songId}`)
      .join('|');

    return [
      this.normalizedCatalogText(name),
      this.normalizedCatalogText(artistName),
      releaseDate?.toISOString().slice(0, 10) ?? '',
      orderedTracks,
    ].join('::');
  }

  private normalizedCatalogText(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  /**
   * Album metadata is the source of truth for its displayed contributors.
   * Keep names intact and split only explicit credit separators, never spaces.
   */
  private albumArtistNames(value: string): string[] {
    const seen = new Set<string>();
    return value
      .split(/\s*(?:,|&|\b(?:and|feat\.?|ft\.?)\b)\s*/i)
      .map((name) => name.trim())
      .filter((name) => {
        const normalizedName = this.normalizedCatalogText(name);
        if (!normalizedName || seen.has(normalizedName)) return false;
        seen.add(normalizedName);
        return true;
      });
  }

  private async resolveAlbumArtistIds(
    tx: Prisma.TransactionClient,
    storefront: string,
    artistName: string,
    suppliedArtistIds: string[],
  ): Promise<string[]> {
    await this.assertArtists(tx, suppliedArtistIds, storefront);

    const names = this.albumArtistNames(artistName);
    if (!names.length) return this.unique(suppliedArtistIds);

    const candidates = await tx.artist.findMany({
      where: {
        storefront,
        OR: [
          ...(suppliedArtistIds.length
            ? [{ id: { in: this.unique(suppliedArtistIds) } }]
            : []),
          ...names.map((name) => ({
            name: { equals: name, mode: 'insensitive' as const },
          })),
        ],
      },
      select: { id: true, name: true },
    });
    const artistIdByName = new Map(
      candidates.map((artist) => [
        this.normalizedCatalogText(artist.name),
        artist.id,
      ]),
    );

    const artistIds: string[] = [];
    for (const name of names) {
      const normalizedName = this.normalizedCatalogText(name);
      const artistId = artistIdByName.get(normalizedName);
      if (artistId) artistIds.push(artistId);
    }
    return artistIds;
  }

  private async publishPlaylist(
    tx: Prisma.TransactionClient,
    draft: CatalogDraft,
    payload: JsonObject,
  ): Promise<void> {
    const tracks = this.assignments(payload.tracks);
    await this.assertSongs(tx, tracks.map((track) => track.songId), draft.storefront);

    const data = {
      storefront: draft.storefront,
      name: this.requiredString(payload.name, 'name'),
      curatorName: this.string(payload.curatorName),
      descriptionShort: this.string(payload.descriptionShort),
      descriptionStandard: this.string(payload.descriptionStandard),
      artworkAssetId: this.requiredString(
        payload.artworkAssetId,
        'artwork_asset_id',
      ),
      editorialArtworkAssetId: this.string(
        payload.editorialArtworkAssetId,
      ),
      editorialVideoAssetId: this.string(
        payload.editorialVideoAssetId,
      ),
      artwork: this.jsonNullable(payload.artwork),
      editorialArtwork: this.jsonNullable(payload.editorialArtwork),
      editorialNotes: this.jsonNullable(payload.editorialNotes),
      editorialVideo: this.jsonNullable(payload.editorialVideo),
      plainEditorialCard: this.jsonNullable(payload.plainEditorialCard),
      plainEditorialNotes: this.jsonNullable(payload.plainEditorialNotes),
      artistNames: this.strings(payload.artistNames),
      audioTraits: this.strings(payload.audioTraits),
      editorialPlaylistKind: this.string(payload.editorialPlaylistKind),
      hasCollaboration: this.boolean(payload.hasCollaboration),
      isChart: this.boolean(payload.isChart),
      playlistType: this.string(payload.playlistType) || 'editorial',
      supportsSing: this.boolean(payload.supportsSing),
      versionHash: `v${draft.version}`,
      lastModifiedAt: new Date(),
      url:
        this.string(payload.url) ||
        this.href(draft.storefront, RESOURCE_TYPES.PLAYLIST, draft.resourceId),
      ownerId: this.string(payload.ownerId),
      isPublic: this.boolean(payload.isPublic),
    };
    await tx.playlist.upsert({
      where: { id: draft.resourceId },
      create: { id: draft.resourceId, ...data },
      update: data,
    });
    await tx.playlistTrack.deleteMany({
      where: { playlistId: draft.resourceId },
    });
    if (tracks.length) {
      await tx.playlistTrack.createMany({
        data: tracks.map((track) => ({
          playlistId: draft.resourceId,
          songId: track.songId,
          position: track.position,
        })),
      });
    }
  }

  private async assertArtists(
    tx: Prisma.TransactionClient,
    artistIds: string[],
    storefront: string,
  ): Promise<void> {
    const uniqueIds = this.unique(artistIds);
    if (!uniqueIds.length) return;
    const count = await tx.artist.count({
      where: { id: { in: uniqueIds }, storefront },
    });
    if (count !== uniqueIds.length) {
      this.failedPrecondition('CATALOG_ARTIST_NOT_PUBLISHED');
    }
  }

  private async assertSongs(
    tx: Prisma.TransactionClient,
    songIds: string[],
    storefront: string,
  ): Promise<void> {
    const uniqueIds = this.unique(songIds);
    if (!uniqueIds.length) return;
    const count = await tx.song.count({
      where: {
        id: { in: uniqueIds },
        storefront,
        isCatalog: true,
        status: SongStatus.SONG_STATUS_READY,
      },
    });
    if (count !== uniqueIds.length) {
      this.failedPrecondition('CATALOG_SONG_NOT_PUBLISHED_OR_NOT_READY');
    }
  }

  private async findDraft(draftId: string): Promise<CatalogDraft> {
    this.requireText(draftId, 'draft_id', 128);
    const draft = await this.prisma.catalogDraft.findUnique({
      where: { id: draftId },
    });
    if (!draft) this.notFound('CATALOG_DRAFT_NOT_FOUND');
    return draft;
  }

  private draftInfo(draft: CatalogDraft): CatalogDraftInfo {
    return {
      id: draft.id,
      resourceType: draft.resourceType,
      resourceId: draft.resourceId,
      storefront: draft.storefront,
      status:
        draft.status === PrismaDraftStatus.PUBLISHED
          ? CatalogDraftStatus.CATALOG_DRAFT_STATUS_PUBLISHED
          : CatalogDraftStatus.CATALOG_DRAFT_STATUS_DRAFT,
      version: draft.version,
      createdBy: draft.createdBy,
      updatedBy: draft.updatedBy,
      publishedAt: draft.publishedAt?.toISOString() ?? '',
      createdAt: draft.createdAt.toISOString(),
      updatedAt: draft.updatedAt.toISOString(),
    };
  }

  private prismaDraftStatus(
    value: CatalogDraftStatus,
  ): PrismaDraftStatus | undefined {
    switch (value) {
      case CatalogDraftStatus.CATALOG_DRAFT_STATUS_DRAFT:
        return PrismaDraftStatus.DRAFT;
      case CatalogDraftStatus.CATALOG_DRAFT_STATUS_PUBLISHED:
        return PrismaDraftStatus.PUBLISHED;
      default:
        return undefined;
    }
  }

  private validateCommon(storefront: string, actorUserId: string): void {
    this.requireText(actorUserId, 'actor_user_id', 128);
    this.requireText(storefront, 'storefront', 8);
    if (!/^[a-z]{2,3}$/.test(storefront)) {
      this.invalidArgument('storefront must use lowercase ISO code');
    }
  }

  private validateCredits(artistIds: string[], composerIds: string[]): void {
    this.validateStringArray(artistIds, 'artist_ids', 128);
    this.validateStringArray(composerIds, 'composer_ids', 128);
    if (artistIds.length > MAX_CREDITS || composerIds.length > MAX_CREDITS) {
      this.invalidArgument(`credits must contain at most ${MAX_CREDITS} IDs`);
    }
  }

  private validateAssignments(
    tracks: Array<{ songId: string; position: number; discNumber: number }>,
  ): void {
    if (tracks.length > MAX_TRACKS) {
      this.invalidArgument(`tracks must contain at most ${MAX_TRACKS} entries`);
    }
    const songIds = new Set<string>();
    const positions = new Set<number>();
    for (const track of tracks) {
      this.requireText(track.songId, 'tracks.song_id', 128);
      if (!Number.isInteger(track.position) || track.position < 0) {
        this.invalidArgument('tracks.position must be a non-negative integer');
      }
      if (songIds.has(track.songId) || positions.has(track.position)) {
        this.invalidArgument('tracks must have unique song IDs and positions');
      }
      songIds.add(track.songId);
      positions.add(track.position);
    }
  }

  private validateStringArray(
    values: string[],
    field: string,
    maxLength: number,
  ): void {
    for (const value of values) {
      this.requireText(value, field, maxLength);
    }
    if (new Set(values).size !== values.length) {
      this.invalidArgument(`${field} must not contain duplicates`);
    }
  }

  private validateDate(value: string, field: string): void {
    if (!value) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
      this.invalidArgument(`${field} must use YYYY-MM-DD format`);
    }
  }

  private rejectDirectAssetMetadata(value: unknown, field: string): void {
    if (
      value === undefined ||
      value === null ||
      Object.keys(this.object(value)).length === 0
    ) {
      return;
    }
    this.invalidArgument(
      `${field} cannot be authored directly; use the corresponding asset_id`,
    );
  }

  private validateOffers(offers: unknown[]): void {
    if (offers.length > MAX_OFFERS) {
      this.invalidArgument(`offers must contain at most ${MAX_OFFERS} entries`);
    }
    this.validateRichMetadata(offers, 'offers');
  }

  private validateRichMetadata(value: unknown, field: string): void {
    if (value === undefined || value === null) return;
    const size = Buffer.byteLength(JSON.stringify(value), 'utf8');
    if (size > MAX_RICH_METADATA_BYTES) {
      this.invalidArgument(
        `${field} must not exceed ${MAX_RICH_METADATA_BYTES} bytes`,
      );
    }
  }

  private assignments(value: unknown): Array<{
    songId: string;
    position: number;
    discNumber: number;
    popularity: number | null;
  }> {
    if (!Array.isArray(value)) return [];
    return value.map((item, index) => {
      const track = this.object(item);
      return {
        songId: this.requiredString(track.songId, `tracks[${index}].songId`),
        position: this.integer(track.position, index),
        discNumber: Math.max(1, this.integer(track.discNumber, 1)),
        popularity:
          typeof track.popularity === 'number' ? track.popularity : null,
      };
    });
  }

  private requireText(value: string, field: string, maxLength: number): void {
    if (!value?.trim()) this.invalidArgument(`${field} is required`);
    if (value.length > maxLength) {
      this.invalidArgument(`${field} must not exceed ${maxLength} characters`);
    }
  }

  private requiredString(value: unknown, field: string): string {
    const result = this.string(value).trim();
    if (!result) this.invalidArgument(`${field} is required`);
    return result;
  }

  private string(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private list<T>(value: T[] | undefined): T[] {
    return Array.isArray(value) ? value : [];
  }

  private optionalString(value: unknown): string | null {
    const result = this.string(value).trim();
    return result || null;
  }

  private strings(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private unique(values: string[]): string[] {
    return [...new Set(values)];
  }

  private integer(value: unknown, fallback = 0): number {
    return typeof value === 'number' && Number.isInteger(value)
      ? value
      : fallback;
  }

  private boolean(value: unknown): boolean {
    return value === true;
  }

  private date(value: unknown): Date | null {
    const result = this.string(value);
    return result ? new Date(`${result}T00:00:00.000Z`) : null;
  }

  private href(storefront: string, type: string, id: string): string {
    return `/catalog/${storefront}/${type}/${id}`;
  }

  private object(value: unknown): JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as JsonObject)
      : {};
  }

  private json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private jsonNullable(
    value: unknown,
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
    if (value === undefined || value === null) return Prisma.DbNull;
    return this.json(this.object(value));
  }

  private unwrapStruct(value: unknown): JsonObject | null {
    if (!value) return null;
    const object = this.object(value);
    const fields = this.object(object.fields);
    if (!Object.keys(fields).length) return object;
    return Object.fromEntries(
      Object.entries(fields).map(([key, item]) => [
        key,
        this.unwrapStructValue(item),
      ]),
    );
  }

  private unwrapStructValue(value: unknown): unknown {
    const item = this.object(value);
    if ('stringValue' in item) return item.stringValue;
    if ('numberValue' in item) return item.numberValue;
    if ('boolValue' in item) return item.boolValue;
    if ('structValue' in item) return this.unwrapStruct(item.structValue);
    if ('listValue' in item) {
      const values = this.object(item.listValue).values;
      return Array.isArray(values)
        ? values.map((entry) => this.unwrapStructValue(entry))
        : [];
    }
    return null;
  }

  private wrapStruct(value: JsonObject): Record<string, unknown> {
    return {
      fields: Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          this.wrapStructValue(item),
        ]),
      ),
    };
  }

  private wrapStructValue(value: unknown): Record<string, unknown> {
    if (value === null || value === undefined) return { nullValue: 0 };
    if (Array.isArray(value)) {
      return {
        listValue: {
          values: value.map((item) => this.wrapStructValue(item)),
        },
      };
    }
    if (typeof value === 'object') {
      return { structValue: this.wrapStruct(this.object(value)) };
    }
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'number') return { numberValue: value };
    if (typeof value === 'boolean') return { boolValue: value };
    return { nullValue: 0 };
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

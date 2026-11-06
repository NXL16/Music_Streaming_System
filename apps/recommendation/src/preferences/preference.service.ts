import { Injectable, Logger } from '@nestjs/common';
import {
  PreferenceEventType,
  RecordPreferenceEventRequest,
  RecordPreferenceEventResponse,
} from '@musical/shared-proto';
import {
  Prisma,
  PreferenceEventType as PrismaPreferenceEventType,
} from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PREFERENCE_SIGNAL_WEIGHT } from '@musical/shared-constants';

const EVENT_TYPES: Record<number, PrismaPreferenceEventType | undefined> = {
  [PreferenceEventType.PREFERENCE_EVENT_TYPE_LIBRARY_ADDED]: 'LIBRARY_ADDED',
  [PreferenceEventType.PREFERENCE_EVENT_TYPE_LIBRARY_REMOVED]:
    'LIBRARY_REMOVED',
  [PreferenceEventType.PREFERENCE_EVENT_TYPE_ALBUM_FAVOURITED]:
    'ALBUM_FAVOURITED',
  [PreferenceEventType.PREFERENCE_EVENT_TYPE_ALBUM_UNFAVOURITED]:
    'ALBUM_UNFAVOURITED',
  [PreferenceEventType.PREFERENCE_EVENT_TYPE_SONG_FAVOURITED]:
    'SONG_FAVOURITED',
  [PreferenceEventType.PREFERENCE_EVENT_TYPE_SONG_UNFAVOURITED]:
    'SONG_UNFAVOURITED',
  [PreferenceEventType.PREFERENCE_EVENT_TYPE_PLAYLIST_FAVOURITED]:
    'PLAYLIST_FAVOURITED',
  [PreferenceEventType.PREFERENCE_EVENT_TYPE_PLAYLIST_UNFAVOURITED]:
    'PLAYLIST_UNFAVOURITED',
  [PreferenceEventType.PREFERENCE_EVENT_TYPE_PLAYLIST_TRACK_ADDED]:
    'PLAYLIST_TRACK_ADDED',
  [PreferenceEventType.PREFERENCE_EVENT_TYPE_PLAYLIST_TRACK_REMOVED]:
    'PLAYLIST_TRACK_REMOVED',
  [PreferenceEventType.PREFERENCE_EVENT_TYPE_ARTIST_FOLLOWED]:
    'ARTIST_FOLLOWED',
  [PreferenceEventType.PREFERENCE_EVENT_TYPE_ARTIST_UNFOLLOWED]:
    'ARTIST_UNFOLLOWED',
  [PreferenceEventType.PREFERENCE_EVENT_TYPE_SEARCH_CLICKED]: 'SEARCH_CLICKED',
  [PreferenceEventType.PREFERENCE_EVENT_TYPE_CONTENT_HIDDEN]: 'CONTENT_HIDDEN',
  [PreferenceEventType.PREFERENCE_EVENT_TYPE_QUEUE_ADDED]: 'QUEUE_ADDED',
};

@Injectable()
export class PreferenceService {
  private readonly logger = new Logger(PreferenceService.name);
  constructor(private readonly prisma: PrismaService) {}

  async record(
    request: RecordPreferenceEventRequest,
  ): Promise<RecordPreferenceEventResponse> {
    const userId = request.userId?.trim();
    const eventId = request.eventId?.trim();
    const resourceType = request.resourceType?.trim();
    const resourceId = request.resourceId?.trim();
    const eventType = EVENT_TYPES[request.eventType];
    if (
      !userId ||
      !eventId ||
      !resourceType ||
      !resourceId ||
      !eventType ||
      userId.length > 128 ||
      eventId.length > 128 ||
      resourceType.length > 64 ||
      resourceId.length > 128 ||
      !Number.isFinite(request.weight) ||
      Math.abs(request.weight) > 100
    ) {
      return { success: false };
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        // Create first. If this is a replay, the transaction rolls back before
        // mutating the current state below, keeping retries truly idempotent.
        await tx.userPreferenceEvent.create({
          data: {
            userId,
            eventId,
            eventType,
            resourceType,
            resourceId,
            weight: request.weight,
          },
        });
        if (eventType === 'CONTENT_HIDDEN') {
          await tx.userContentPreference.upsert({
            where: {
              userId_resourceType_resourceId: {
                userId,
                resourceType,
                resourceId,
              },
            },
            create: {
              userId,
              resourceType,
              resourceId,
              isHidden: request.weight < 0,
            },
            update: { isHidden: request.weight < 0 },
          });
        }
        if (
          eventType === 'ALBUM_FAVOURITED' ||
          eventType === 'SONG_FAVOURITED' ||
          eventType === 'PLAYLIST_FAVOURITED'
        ) {
          // A Favourite is an explicit stronger preference than Suggest Less.
          // Resolve this conflict on the server so actions from any client are
          // consistent even if the UI closes before its optimistic cleanup.
          await tx.userContentPreference.upsert({
            where: {
              userId_resourceType_resourceId: {
                userId,
                resourceType,
                resourceId,
              },
            },
            create: { userId, resourceType, resourceId, isHidden: false },
            update: { isHidden: false },
          });
        }
        await tx.recommendationPage.updateMany({
          where: { userId, status: 'PUBLISHED' },
          data: { staleAfter: new Date() },
        });
      });
      return { success: true };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        return { success: true };
      this.logger.error('Failed to record preference event', error);
      return { success: false };
    }
  }

  async listHiddenContent(userId: string) {
    if (!userId?.trim()) return { hiddenResources: [] };
    const hiddenResources = await this.prisma.userContentPreference.findMany({
      where: { userId, isHidden: true },
      select: { resourceType: true, resourceId: true },
      orderBy: { updatedAt: 'desc' },
    });
    return { hiddenResources };
  }

  async setArtistFollow(userId: string, artistId: string, isFollowed: boolean) {
    const existing = await this.prisma.userArtistFollow.findUnique({
      where: { userId_artistId: { userId, artistId } },
    });
    const changed = isFollowed ? !existing : Boolean(existing);
    if (!changed) return { success: true, isFollowed, changed: false };
    const eventType = isFollowed ? 'ARTIST_FOLLOWED' : 'ARTIST_UNFOLLOWED';
    await this.prisma.$transaction(async (tx) => {
      if (isFollowed) {
        await tx.userArtistFollow.create({ data: { userId, artistId } });
      } else {
        await tx.userArtistFollow.delete({
          where: { userId_artistId: { userId, artistId } },
        });
      }
      await tx.userPreferenceEvent.create({
        data: {
          userId,
          eventId: `artist-follow:${userId}:${artistId}:${Date.now()}`,
          eventType,
          resourceType: 'artists',
          resourceId: artistId,
          weight: isFollowed
            ? PREFERENCE_SIGNAL_WEIGHT.ARTIST_FOLLOWED
            : PREFERENCE_SIGNAL_WEIGHT.ARTIST_UNFOLLOWED,
        },
      });
      await tx.recommendationPage.updateMany({
        where: { userId, status: 'PUBLISHED' },
        data: { staleAfter: new Date() },
      });
    });
    return { success: true, isFollowed, changed: true };
  }

  async isArtistFollowed(userId: string, artistId: string) {
    return {
      isFollowed: Boolean(
        await this.prisma.userArtistFollow.findUnique({
          where: { userId_artistId: { userId, artistId } },
        }),
      ),
    };
  }
}

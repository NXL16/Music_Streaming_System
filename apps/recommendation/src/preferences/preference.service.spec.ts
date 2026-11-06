import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { PreferenceService } from './preference.service';

type ContentPreferenceUpsertInput = {
  create: { isHidden: boolean };
  update: { isHidden: boolean };
};

type PreferenceEventCreateInput = {
  data: { eventType: string };
};

type RecentSearchUpsertInput = {
  create: { userId: string; resourceType: string; resourceId: string };
  update: { searchedAt: Date };
};

jest.mock('@musical/shared-proto', () => ({
  PreferenceEventType: {
    PREFERENCE_EVENT_TYPE_ALBUM_FAVOURITED: 3,
    PREFERENCE_EVENT_TYPE_SEARCH_CLICKED: 11,
    PREFERENCE_EVENT_TYPE_CONTENT_HIDDEN: 12,
    PREFERENCE_EVENT_TYPE_PLAYLIST_FAVOURITED: 14,
  },
}));

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () => ({
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      readonly code: string;

      constructor(message: string, options: { code: string }) {
        super(message);
        this.code = options.code;
      }
    },
  },
}));

describe('PreferenceService', () => {
  const request = {
    userId: 'user-1',
    eventId: 'event-1',
    eventType: 12,
    resourceType: 'albums',
    resourceId: 'album-1',
    weight: -8,
  };

  it('persists an opt-out event and current hidden state atomically', async () => {
    const create = jest.fn();
    const upsert = jest.fn<void, [ContentPreferenceUpsertInput]>();
    const updateMany = jest.fn();
    const transactionClient = {
      userPreferenceEvent: { create },
      userContentPreference: { upsert },
      recommendationPage: { updateMany },
    };
    const transaction = jest.fn(
      async (
        callback: (client: typeof transactionClient) => Promise<unknown>,
      ) => callback(transactionClient),
    );
    const service = new PreferenceService({
      $transaction: transaction,
    } as unknown as PrismaService);

    await expect(service.record(request)).resolves.toEqual({ success: true });

    expect(create).toHaveBeenCalledWith({
      data: { ...request, eventType: 'CONTENT_HIDDEN' },
    });
    expect(upsert).toHaveBeenCalledWith({
      where: {
        userId_resourceType_resourceId: {
          userId: 'user-1',
          resourceType: 'albums',
          resourceId: 'album-1',
        },
      },
      create: {
        userId: 'user-1',
        resourceType: 'albums',
        resourceId: 'album-1',
        isHidden: true,
      },
      update: { isHidden: true },
    });
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it('clears a conflicting Suggest Less state when a resource is favourited', async () => {
    const create = jest.fn();
    let upsertInput: ContentPreferenceUpsertInput | undefined;
    const upsert = jest.fn((input: ContentPreferenceUpsertInput) => {
      upsertInput = input;
    });
    const updateMany = jest.fn();
    const transactionClient = {
      userPreferenceEvent: { create },
      userContentPreference: { upsert },
      recommendationPage: { updateMany },
    };
    const service = new PreferenceService({
      $transaction: jest.fn(
        (callback: (client: typeof transactionClient) => Promise<unknown>) =>
          callback(transactionClient),
      ),
    } as unknown as PrismaService);

    await expect(
      service.record({
        ...request,
        eventId: 'favourite-event',
        eventType: 3,
        weight: 5,
      }),
    ).resolves.toEqual({ success: true });

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsertInput?.create.isHidden).toBe(false);
    expect(upsertInput?.update.isHidden).toBe(false);
  });

  it('accepts playlist favourites as an explicit preference signal', async () => {
    let createInput: PreferenceEventCreateInput | undefined;
    const create = jest.fn((input: PreferenceEventCreateInput) => {
      createInput = input;
    });
    let upsertInput: ContentPreferenceUpsertInput | undefined;
    const upsert = jest.fn((input: ContentPreferenceUpsertInput) => {
      upsertInput = input;
    });
    const transactionClient = {
      userPreferenceEvent: { create },
      userContentPreference: { upsert },
      recommendationPage: { updateMany: jest.fn() },
    };
    const service = new PreferenceService({
      $transaction: jest.fn(
        (callback: (client: typeof transactionClient) => Promise<unknown>) =>
          callback(transactionClient),
      ),
    } as unknown as PrismaService);

    await expect(
      service.record({
        ...request,
        eventId: 'playlist-favourite-event',
        eventType: 14,
        resourceType: 'playlists',
        resourceId: 'playlist-1',
        weight: 5,
      }),
    ).resolves.toEqual({ success: true });

    expect(create).toHaveBeenCalledTimes(1);
    expect(createInput?.data.eventType).toBe('PLAYLIST_FAVOURITED');
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsertInput?.update.isHidden).toBe(false);
  });

  it('treats a replayed event ID as success without invalidating Home again', async () => {
    const updateMany = jest.fn();
    const service = new PreferenceService({
      $transaction: jest.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      ),
    } as unknown as PrismaService);

    await expect(service.record(request)).resolves.toEqual({ success: true });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('returns only the current hidden resources for Suggest Less hydration', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([{ resourceType: 'albums', resourceId: 'album-1' }]);
    const service = new PreferenceService({
      userContentPreference: { findMany },
    } as unknown as PrismaService);

    await expect(service.listHiddenContent('user-1')).resolves.toEqual({
      hiddenResources: [{ resourceType: 'albums', resourceId: 'album-1' }],
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', isHidden: true },
      select: { resourceType: true, resourceId: true },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('upserts a selected search result and keeps only the newest history', async () => {
    const create = jest.fn();
    const upsert = jest.fn<void, [RecentSearchUpsertInput]>();
    const findMany = jest.fn().mockResolvedValue([]);
    const deleteMany = jest.fn();
    const service = new PreferenceService({
      $transaction: jest.fn((callback: (client: unknown) => Promise<unknown>) =>
        callback({
          userPreferenceEvent: { create },
          userRecentSearch: { upsert, findMany, deleteMany },
          recommendationPage: { updateMany: jest.fn() },
        }),
      ),
    } as unknown as PrismaService);

    await expect(
      service.record({ ...request, eventType: 11, weight: 1 }),
    ).resolves.toEqual({ success: true });

    expect(upsert).toHaveBeenCalledTimes(1);
    const upsertInput = upsert.mock.calls[0]?.[0];
    expect(upsertInput?.create).toEqual({
      userId: 'user-1',
      resourceType: 'albums',
      resourceId: 'album-1',
    });
    expect(upsertInput?.update.searchedAt).toBeInstanceOf(Date);
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { searchedAt: 'desc' },
      skip: 10,
      select: { id: true },
    });
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('lists and clears only the requesting user’s search history', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([{ resourceType: 'songs', resourceId: 'song-1' }]);
    const deleteMany = jest.fn();
    const service = new PreferenceService({
      userRecentSearch: { findMany, deleteMany },
    } as unknown as PrismaService);

    await expect(
      service.listRecentSearches({ userId: 'user-1', limit: 30 }),
    ).resolves.toEqual({
      resources: [{ resourceType: 'songs', resourceId: 'song-1' }],
    });
    await expect(
      service.clearRecentSearches({ userId: 'user-1' }),
    ).resolves.toEqual({ success: true });
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
  });
});

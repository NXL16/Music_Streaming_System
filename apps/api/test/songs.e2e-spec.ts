import {
  ForbiddenException,
  INestApplication,
  NotFoundException,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { SongsController } from '../src/songs/songs.controller';
import { SongsService } from '../src/songs/songs.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ThrottlerExceptionFilter } from '../src/common/filters/throttler-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';

type HttpServer = Parameters<typeof request>[0];

interface ApiResponseBody {
  success: boolean;
  code: string;
}

describe('SongsController (e2e)', () => {
  let app: INestApplication;
  const getHttpServer = (): HttpServer => app.getHttpServer() as HttpServer;

  const songsServiceMock = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    uploadSong: jest.fn(),
    getSongDecryptionKey: jest.fn(),
  };

  const currentUser = {
    userId: '69e559ac4de596f7c3934b01',
  };

  beforeAll(async () => {
    const moduleBuilder = Test.createTestingModule({
      controllers: [SongsController],
      providers: [
        {
          provide: SongsService,
          useValue: songsServiceMock,
        },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => { user?: unknown } };
        }) => {
          const req = context.switchToHttp().getRequest();
          req.user = currentUser;
          return true;
        },
      });

    const moduleRef = await moduleBuilder.compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    app.useGlobalFilters(
      new ValidationExceptionFilter(),
      new ThrottlerExceptionFilter(),
      new HttpExceptionFilter(),
    );

    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /songs -> returns list with pagination', async () => {
    songsServiceMock.findAll.mockResolvedValue({
      songs: [{ _id: '1', title: 'Song A' }],
      pagination: {
        nextCursor: null,
        limit: 20,
        hasMore: false,
      },
    });

    const response = await request(getHttpServer()).get('/songs?limit=20');
    const body = response.body as ApiResponseBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.code).toBe('SONGS_LIST_SUCCESS');
    expect(songsServiceMock.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20 }),
    );
  });

  it('GET /songs -> returns 400 for invalid cursor format', async () => {
    const response = await request(getHttpServer()).get('/songs?cursor=invalid-cursor');
    const body = response.body as ApiResponseBody;

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe('BAD_REQUEST');
  });

  it('GET /songs/:id -> returns song details for authorized user', async () => {
    const songId = '507f1f77bcf86cd799439011';

    songsServiceMock.findOne.mockResolvedValue({
      _id: songId,
      title: 'Private Song',
      uploadedBy: currentUser.userId,
      isPublic: false,
    });

    const response = await request(getHttpServer()).get(`/songs/${songId}`);
    const body = response.body as ApiResponseBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.code).toBe('SONG_DETAILS_SUCCESS');
    expect(songsServiceMock.findOne).toHaveBeenCalledWith(songId, currentUser.userId);
  });

  it('GET /songs/:id -> returns forbidden when user has no access', async () => {
    const songId = '507f1f77bcf86cd799439011';

    songsServiceMock.findOne.mockRejectedValue(
      new ForbiddenException('Bạn không có quyền truy cập bài hát này'),
    );

    const response = await request(getHttpServer()).get(`/songs/${songId}`);
    const body = response.body as ApiResponseBody;

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('GET /songs/:id -> returns not found when song does not exist', async () => {
    const songId = '507f1f77bcf86cd799439099';

    songsServiceMock.findOne.mockRejectedValue(
      new NotFoundException({ code: 'SONG_NOT_FOUND', message: 'Bài hát không tồn tại' }),
    );

    const response = await request(getHttpServer()).get(`/songs/${songId}`);
    const body = response.body as ApiResponseBody;

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.code).toBe('SONG_NOT_FOUND');
  });

  it('GET /songs/:id/key -> returns binary key for playback', async () => {
    const songId = '507f1f77bcf86cd799439011';
    const keyBuffer = Buffer.from('test-decryption-key', 'utf8');

    songsServiceMock.getSongDecryptionKey.mockResolvedValue(keyBuffer);

    const response = await request(getHttpServer())
      .get(`/songs/${songId}/key`)
      .set('User-Agent', 'jest-e2e-agent');

    const rawBody = response.body as Buffer;

    expect(response.status).toBe(200);
    expect(response.header['content-type']).toContain('application/octet-stream');
    expect(rawBody.toString('utf8')).toBe('test-decryption-key');
    expect(songsServiceMock.getSongDecryptionKey).toHaveBeenCalledWith(
      songId,
      currentUser.userId,
      'jest-e2e-agent',
    );
  });

  it('GET /songs/:id/key -> uses fallback fingerprint when User-Agent is missing', async () => {
    const songId = '507f1f77bcf86cd799439011';
    const keyBuffer = Buffer.from('fallback-key', 'utf8');

    songsServiceMock.getSongDecryptionKey.mockResolvedValue(keyBuffer);

    const response = await request(getHttpServer()).get(`/songs/${songId}/key`);

    expect(response.status).toBe(200);
    expect(songsServiceMock.getSongDecryptionKey).toHaveBeenCalledWith(
      songId,
      currentUser.userId,
      'unknown-device',
    );
  });

  it('GET /songs/:id/key -> returns forbidden when key access is denied', async () => {
    const songId = '507f1f77bcf86cd799439011';

    songsServiceMock.getSongDecryptionKey.mockRejectedValue(
      new ForbiddenException('Bạn không có quyền truy cập bài hát này'),
    );

    const response = await request(getHttpServer()).get(`/songs/${songId}/key`);
    const body = response.body as ApiResponseBody;

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('GET /songs/:id/key -> returns bad request when song is not ready', async () => {
    const songId = '507f1f77bcf86cd799439011';

    songsServiceMock.getSongDecryptionKey.mockRejectedValue(
      new BadRequestException('Bài hát chưa sẵn sàng để phát'),
    );

    const response = await request(getHttpServer()).get(`/songs/${songId}/key`);
    const body = response.body as ApiResponseBody;

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe('BAD_REQUEST');
  });
});

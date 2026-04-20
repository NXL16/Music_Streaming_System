import { INestApplication, ValidationPipe } from '@nestjs/common';
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

describe('Songs Upload Flow (e2e)', () => {
  let app: INestApplication;
  const getHttpServer = (): HttpServer => app.getHttpServer() as HttpServer;

  const songsServiceMock = {
    uploadSong: jest.fn(),
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

  it('POST /songs/upload -> returns 400 when file is missing', async () => {
    const response = await request(getHttpServer())
      .post('/songs/upload')
      .field('title', 'No File Song')
      .field('isPublic', 'false');

    const body = response.body as ApiResponseBody;

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe('NO_FILE');
  });

  it('POST /songs/upload -> returns 400 when file type is invalid', async () => {
    const response = await request(getHttpServer())
      .post('/songs/upload')
      .field('title', 'Invalid File')
      .attach('file', Buffer.from('not-an-audio-file', 'utf8'), {
        filename: 'bad.txt',
        contentType: 'text/plain',
      });

    const body = response.body as ApiResponseBody;

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe('INVALID_FILE_TYPE');
  });

  it('POST /songs/upload -> success for valid audio signature and maps isPublic', async () => {
    songsServiceMock.uploadSong.mockResolvedValue({
      isDuplicate: false,
      song: {
        _id: '507f1f77bcf86cd799439011',
        title: 'Upload Success',
      },
    });

    const mp3Header = Buffer.from([
      0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x21,
    ]);

    const response = await request(getHttpServer())
      .post('/songs/upload')
      .field('title', 'Upload Success')
      .field('isPublic', 'true')
      .attach('file', mp3Header, {
        filename: 'sample.mp3',
        contentType: 'audio/mpeg',
      });

    const body = response.body as ApiResponseBody;

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.code).toBe('SONG_PROCESSING');
    expect(songsServiceMock.uploadSong).toHaveBeenCalledWith(
      expect.objectContaining({
        originalname: 'sample.mp3',
        mimetype: 'audio/mpeg',
      }),
      currentUser.userId,
      'Upload Success',
      true,
    );
  });

  it('POST /songs/upload -> returns 400 when audio signature is invalid', async () => {
    const fakeAudioPayload = Buffer.from('this-is-not-a-real-audio-signature', 'utf8');

    const response = await request(getHttpServer())
      .post('/songs/upload')
      .field('title', 'Invalid Signature')
      .attach('file', fakeAudioPayload, {
        filename: 'fake.mp3',
        contentType: 'audio/mpeg',
      });

    const body = response.body as ApiResponseBody;

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe('INVALID_FILE_CONTENT');
    expect(songsServiceMock.uploadSong).not.toHaveBeenCalled();
  });

  it('POST /songs/upload -> returns SONG_DUPLICATE when service detects duplicate', async () => {
    songsServiceMock.uploadSong.mockResolvedValue({
      isDuplicate: true,
      song: {
        _id: '507f1f77bcf86cd799439088',
        title: 'Duplicate Song',
      },
    });

    const mp3Header = Buffer.from([
      0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x21,
    ]);

    const response = await request(getHttpServer())
      .post('/songs/upload')
      .field('title', 'Duplicate Song')
      .attach('file', mp3Header, {
        filename: 'duplicate.mp3',
        contentType: 'audio/mpeg',
      });

    const body = response.body as ApiResponseBody;

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.code).toBe('SONG_DUPLICATE');
  });

  it('POST /songs/upload -> returns SONG_UPLOAD_FAILED when service throws unknown error', async () => {
    songsServiceMock.uploadSong.mockRejectedValue(new Error('unexpected failure'));

    const mp3Header = Buffer.from([
      0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x21,
    ]);

    const response = await request(getHttpServer())
      .post('/songs/upload')
      .field('title', 'Unexpected Failure')
      .attach('file', mp3Header, {
        filename: 'failure.mp3',
        contentType: 'audio/mpeg',
      });

    const body = response.body as ApiResponseBody;

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.code).toBe('SONG_UPLOAD_FAILED');
  });
});

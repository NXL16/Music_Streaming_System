import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { KmsController } from '../src/kms/kms.controller';
import { KmsService } from '../src/kms/kms.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ThrottlerExceptionFilter } from '../src/common/filters/throttler-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';

type HttpServer = Parameters<typeof request>[0];

interface KmsGenerateResponseBody {
  message: string;
  key_id: string;
  key_hex: string;
  iv_hex: string;
}

interface ErrorResponseBody {
  success: boolean;
  code: string;
}

describe('KmsController (e2e)', () => {
  let app: INestApplication;
  const getHttpServer = (): HttpServer => app.getHttpServer() as HttpServer;

  const kmsServiceMock = {
    generateKey: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [KmsController],
      providers: [
        {
          provide: KmsService,
          useValue: kmsServiceMock,
        },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

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

  it('GET /kms/test-generate/:songId -> returns generated key data in hex', async () => {
    const songId = '507f1f77bcf86cd799439011';

    kmsServiceMock.generateKey.mockResolvedValue({
      key_id: 'key-123',
      key: Uint8Array.from([0xde, 0xad, 0xbe, 0xef]),
      iv: Uint8Array.from([0xca, 0xfe, 0xba, 0xbe]),
    });

    const response = await request(getHttpServer()).get(`/kms/test-generate/${songId}`);
    const body = response.body as KmsGenerateResponseBody;

    expect(response.status).toBe(200);
    expect(body.message).toBe('Gọi gRPC sang KMS thành công!');
    expect(body.key_id).toBe('key-123');
    expect(body.key_hex).toBe('deadbeef');
    expect(body.iv_hex).toBe('cafebabe');
    expect(kmsServiceMock.generateKey).toHaveBeenCalledWith(songId, 'user-test-123');
  });

  it('GET /kms/test-generate/:songId -> propagates service error', async () => {
    const songId = '507f1f77bcf86cd799439011';

    kmsServiceMock.generateKey.mockRejectedValue(
      new BadRequestException('Không thể tạo khóa cho bài hát này'),
    );

    const response = await request(getHttpServer()).get(`/kms/test-generate/${songId}`);
    const body = response.body as ErrorResponseBody;

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe('BAD_REQUEST');
  });
});

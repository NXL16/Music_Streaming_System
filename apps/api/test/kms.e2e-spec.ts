import {
  BadRequestException,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtUser, UserRole } from '@musical/shared-types';
import request from 'supertest';
import { AdminGuard } from '../src/auth/guards/admin.guard';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ThrottlerExceptionFilter } from '../src/common/filters/throttler-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';
import { KmsController } from '../src/kms/kms.controller';
import { KmsService } from '../src/kms/kms.service';

type HttpServer = Parameters<typeof request>[0];

type NodeEnv = 'test' | 'production';

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

interface RequestWithUser {
  user?: JwtUser;
}

describe('KmsController (e2e)', () => {
  let app: INestApplication;
  const getHttpServer = (): HttpServer => app.getHttpServer() as HttpServer;

  const kmsServiceMock = {
    generateKey: jest.fn(),
  };

  let nodeEnv: NodeEnv = 'test';

  const configServiceMock = {
    get: jest.fn((key: string): string | undefined => {
      if (key === 'NODE_ENV') {
        return nodeEnv;
      }

      return undefined;
    }),
  };

  const jwtAuthGuardMock = {
    canActivate: jest.fn((context: ExecutionContext): boolean => {
      const req = context.switchToHttp().getRequest<RequestWithUser>();
      req.user = {
        userId: 'admin-user-123',
        username: 'admin',
        role: UserRole.ADMIN,
        deviceId: 'device-1',
      };

      return true;
    }),
  };

  const adminGuardMock = {
    canActivate: jest.fn().mockReturnValue(true),
  };

  const throttlerGuardMock = {
    canActivate: jest.fn().mockReturnValue(true),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [KmsController],
      providers: [
        {
          provide: KmsService,
          useValue: kmsServiceMock,
        },
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(jwtAuthGuardMock)
      .overrideGuard(AdminGuard)
      .useValue(adminGuardMock)
      .overrideGuard(ThrottlerGuard)
      .useValue(throttlerGuardMock)
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
    nodeEnv = 'test';
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

    const response = await request(getHttpServer()).get(
      `/kms/test-generate/${songId}`,
    );
    const body = response.body as KmsGenerateResponseBody;

    expect(response.status).toBe(200);
    expect(body.message).toBe('Gọi gRPC sang KMS thành công!');
    expect(body.key_id).toBe('key-123');
    expect(body.key_hex).toBe('deadbeef');
    expect(body.iv_hex).toBe('cafebabe');
    expect(kmsServiceMock.generateKey).toHaveBeenCalledWith(
      songId,
      'admin-user-123',
    );
  });

  it('GET /kms/test-generate/:songId -> propagates service error', async () => {
    const songId = '507f1f77bcf86cd799439011';

    kmsServiceMock.generateKey.mockRejectedValue(
      new BadRequestException('Không thể tạo khóa cho bài hát này'),
    );

    const response = await request(getHttpServer()).get(
      `/kms/test-generate/${songId}`,
    );
    const body = response.body as ErrorResponseBody;

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe('BAD_REQUEST');
  });

  it('GET /kms/test-generate/:songId -> disabled in production', async () => {
    const songId = '507f1f77bcf86cd799439011';
    nodeEnv = 'production';

    const response = await request(getHttpServer()).get(
      `/kms/test-generate/${songId}`,
    );
    const body = response.body as ErrorResponseBody;

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.code).toBe('KMS_TEST_ENDPOINT_DISABLED');
    expect(kmsServiceMock.generateKey).not.toHaveBeenCalled();
  });
});

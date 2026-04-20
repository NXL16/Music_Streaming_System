import {
  INestApplication,
  InternalServerErrorException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CleanupController } from '../src/common/cleanup/cleanup.controller';
import { CleanupService } from '../src/common/cleanup/cleanup.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { AdminGuard } from '../src/auth/guards/admin.guard';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';

type HttpServer = Parameters<typeof request>[0];

interface CleanupResponseBody {
  success: boolean;
  message: string;
}

interface ErrorResponseBody {
  success: boolean;
  code: string;
}

describe('CleanupController (e2e)', () => {
  let app: INestApplication;
  const getHttpServer = (): HttpServer => app.getHttpServer() as HttpServer;

  const cleanupServiceMock = {
    cleanupTempFiles: jest.fn(),
    cleanupFailedProcessing: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CleanupController],
      providers: [
        {
          provide: CleanupService,
          useValue: cleanupServiceMock,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(AdminGuard)
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

    app.useGlobalFilters(new ValidationExceptionFilter(), new HttpExceptionFilter());

    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    cleanupServiceMock.cleanupTempFiles.mockReturnValue(undefined);
    cleanupServiceMock.cleanupFailedProcessing.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('POST /cleanup/temp-files -> success', async () => {
    const response = await request(getHttpServer()).post('/cleanup/temp-files').send();
    const body = response.body as CleanupResponseBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(cleanupServiceMock.cleanupTempFiles).toHaveBeenCalledTimes(1);
  });

  it('POST /cleanup/failed-processing -> success', async () => {
    const response = await request(getHttpServer())
      .post('/cleanup/failed-processing')
      .send();
    const body = response.body as CleanupResponseBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(cleanupServiceMock.cleanupFailedProcessing).toHaveBeenCalledTimes(1);
  });

  it('POST /cleanup/all -> success and trigger both cleanup tasks', async () => {
    const response = await request(getHttpServer()).post('/cleanup/all').send();
    const body = response.body as CleanupResponseBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(cleanupServiceMock.cleanupTempFiles).toHaveBeenCalledTimes(1);
    expect(cleanupServiceMock.cleanupFailedProcessing).toHaveBeenCalledTimes(1);
  });

  it('POST /cleanup/failed-processing -> returns 500 when service fails', async () => {
    cleanupServiceMock.cleanupFailedProcessing.mockRejectedValue(
      new InternalServerErrorException('Cleanup failed unexpectedly'),
    );

    const response = await request(getHttpServer())
      .post('/cleanup/failed-processing')
      .send();
    const body = response.body as ErrorResponseBody;

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.code).toBe('INTERNAL_SERVER_ERROR');
  });
});

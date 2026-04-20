import {
  ConflictException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ThrottlerExceptionFilter } from '../src/common/filters/throttler-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';

type HttpServer = Parameters<typeof request>[0];

interface ApiResponseBody {
  success: boolean;
  code: string;
}

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  const getHttpServer = (): HttpServer => app.getHttpServer() as HttpServer;

  const authServiceMock = {
    signUp: jest.fn(),
    login: jest.fn(),
    refreshToken: jest.fn(),
    logout: jest.fn(),
    logoutAll: jest.fn(),
  };

  const currentUser = {
    userId: '69e559ac4de596f7c3934b01',
    deviceId: '505451c7-7281-4245-8b45-2f911c05ec1d',
  };

  beforeAll(async () => {
    const moduleBuilder = Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authServiceMock,
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

  it('POST /auth/signup -> signup success and normalize username/email', async () => {
    authServiceMock.signUp.mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      deviceId: currentUser.deviceId,
    });

    const response = await request(getHttpServer()).post('/auth/signup').send({
      username: 'User_TEST',
      email: 'USER@MAIL.COM',
      password: 'Strong@123',
      displayName: 'User Test',
      deviceId: currentUser.deviceId,
    });
    const body = response.body as ApiResponseBody;

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.code).toBe('AUTH_SIGNUP_SUCCESS');
    expect(authServiceMock.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'user_test',
        email: 'user@mail.com',
      }),
    );
  });

  it('POST /auth/signup -> validation error for weak password', async () => {
    const response = await request(getHttpServer()).post('/auth/signup').send({
      username: 'abcuser',
      email: 'abc@mail.com',
      password: '123',
      displayName: 'ABC',
    });
    const body = response.body as ApiResponseBody;

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe('BAD_REQUEST');
  });

  it('POST /auth/signup -> returns conflict when username already exists', async () => {
    authServiceMock.signUp.mockRejectedValue(
      new ConflictException({
        code: 'AUTH_USERNAME_EXISTS',
        message: 'Username đã tồn tại',
      }),
    );

    const response = await request(getHttpServer()).post('/auth/signup').send({
      username: 'user_test',
      email: 'user@mail.com',
      password: 'Strong@123',
      displayName: 'User Test',
    });
    const body = response.body as ApiResponseBody;

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.code).toBe('AUTH_USERNAME_EXISTS');
  });

  it('POST /auth/login -> success', async () => {
    authServiceMock.login.mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      deviceId: currentUser.deviceId,
    });

    const response = await request(getHttpServer()).post('/auth/login').send({
      username: 'user_test',
      password: 'Strong@123',
      deviceId: currentUser.deviceId,
    });
    const body = response.body as ApiResponseBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.code).toBe('AUTH_LOGIN_SUCCESS');
    expect(authServiceMock.login).toHaveBeenCalledTimes(1);
  });

  it('POST /auth/login -> unauthorized when credentials are invalid', async () => {
    authServiceMock.login.mockRejectedValue(
      new UnauthorizedException({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Username hoặc password không đúng',
      }),
    );

    const response = await request(getHttpServer()).post('/auth/login').send({
      username: 'user_test',
      password: 'Wrong@123',
    });
    const body = response.body as ApiResponseBody;

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('POST /auth/refresh -> 400 when refreshToken is missing', async () => {
    const response = await request(getHttpServer()).post('/auth/refresh').send({});
    const body = response.body as ApiResponseBody;

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe('AUTH_REFRESH_TOKEN_REQUIRED');
  });

  it('POST /auth/refresh -> success', async () => {
    authServiceMock.refreshToken.mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      deviceId: currentUser.deviceId,
    });

    const response = await request(getHttpServer()).post('/auth/refresh').send({
      refreshToken: 'valid-refresh-token',
    });
    const body = response.body as ApiResponseBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.code).toBe('AUTH_REFRESH_SUCCESS');
  });

  it('POST /auth/refresh -> unauthorized when token is invalid', async () => {
    authServiceMock.refreshToken.mockRejectedValue(
      new UnauthorizedException({
        code: 'AUTH_TOKEN_INVALID',
        message: 'Token không hợp lệ',
      }),
    );

    const response = await request(getHttpServer()).post('/auth/refresh').send({
      refreshToken: 'invalid-token',
    });
    const body = response.body as ApiResponseBody;

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.code).toBe('AUTH_TOKEN_INVALID');
  });

  it('POST /auth/logout -> success and call service with userId/deviceId from guard', async () => {
    authServiceMock.logout.mockResolvedValue(undefined);

    const response = await request(getHttpServer()).post('/auth/logout').send();
    const body = response.body as ApiResponseBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.code).toBe('AUTH_LOGOUT_SUCCESS');
    expect(authServiceMock.logout).toHaveBeenCalledWith(
      currentUser.userId,
      currentUser.deviceId,
    );
  });

  it('POST /auth/logout-all -> success and call service with userId from guard', async () => {
    authServiceMock.logoutAll.mockResolvedValue(undefined);

    const response = await request(getHttpServer()).post('/auth/logout-all').send();
    const body = response.body as ApiResponseBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.code).toBe('AUTH_LOGOUT_ALL_SUCCESS');
    expect(authServiceMock.logoutAll).toHaveBeenCalledWith(currentUser.userId);
  });
});

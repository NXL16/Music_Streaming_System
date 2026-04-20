import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';

type HttpServer = Parameters<typeof request>[0];

describe('App Root Endpoint (e2e)', () => {
  let app: INestApplication;
  const getHttpServer = (): HttpServer => app.getHttpServer() as HttpServer;

  const appServiceMock = {
    getHello: jest.fn().mockReturnValue('Hello World!'),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: appServiceMock,
        },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    appServiceMock.getHello.mockReturnValue('Hello World!');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET / -> returns hello message', async () => {
    const response = await request(getHttpServer()).get('/');

    expect(response.status).toBe(200);
    expect(response.text).toBe('Hello World!');
    expect(appServiceMock.getHello).toHaveBeenCalledTimes(1);
  });

  it('GET / -> returns custom service message', async () => {
    appServiceMock.getHello.mockReturnValue('API is healthy');

    const response = await request(getHttpServer()).get('/');

    expect(response.status).toBe(200);
    expect(response.text).toBe('API is healthy');
  });
});

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerExceptionFilter } from './common/filters/throttler-exception.filter';
import { ValidationExceptionFilter } from './common/filters/validation-exception.filter';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { GrpcExceptionFilter } from './common/filters/grpc-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const corsOrigin = configService.get<string>('CORS_ORIGIN')!;
  const host = configService.getOrThrow<string>('API_HOST');
  const port = Number(configService.getOrThrow<string>('API_PORT'));
  const prefix = configService.getOrThrow<string>('API_PREFIX');

  if (corsOrigin.trim() === '*') {
    throw new Error('CORS_ORIGIN must not be "*" when credentials are enabled');
  }

  app.enableCors({
    origin: corsOrigin,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  app.setGlobalPrefix(prefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: true,
    }),
  );

  app.useGlobalFilters(
    new GrpcExceptionFilter(),
    new ThrottlerExceptionFilter(),
    new ValidationExceptionFilter(),
    new HttpExceptionFilter(),
  );

  await app.listen(port, () =>
    console.log(`API Server is running at http://${host}:${port}/${prefix}`),
  );
}

bootstrap().catch((e) => console.error('Error starting server:', e));

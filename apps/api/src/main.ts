import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerExceptionFilter } from './common/filters/throttler-exception.filter';
import { ValidationExceptionFilter } from './common/filters/validation-exception.filter';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  const corsOrigin =
    configService.get<string>('CORS_ORIGIN') ||
    configService.getOrThrow<string>('WEB_URL');
  const host = configService.getOrThrow<string>('API_HOST');
  const port = Number(configService.getOrThrow<string>('API_PORT'));
  const prefix = configService.getOrThrow<string>('API_PREFIX');

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
    }),
  );

  app.useGlobalFilters(
    new ValidationExceptionFilter(),
    new ThrottlerExceptionFilter(),
    new HttpExceptionFilter(),
  );

  await app.listen(port, () =>
    console.log(`API Server is running at http://${host}:${port}/${prefix}`),
  );
}

bootstrap().catch((e) => console.error('Error starting server:', e));

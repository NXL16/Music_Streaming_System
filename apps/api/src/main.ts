import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  const webUrl = configService.get<string>('WEB_URL');
  const host = configService.get<string>('API_HOST');
  const port = Number(configService.get<string>('API_PORT'));
  const prefix = configService.get<string>('API_PREFIX');

  app.enableCors({
    origin: webUrl,
    credentials: true, // Bắt buộc bật để gửi Signed Cookie cho HLS và Token
  });

  app.setGlobalPrefix(prefix as string);

  // Kích hoạt Validation toàn cục cho DTO
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Tự động loại bỏ các trường gửi lên mà không được khai báo trong DTO
      forbidNonWhitelisted: true, // Báo lỗi 400 nếu client gửi lên các trường lạ
      transform: true, // Tự động chuyển đổi kiểu dữ liệu (Ví dụ: parse string thành number)
    }),
  );

  await app.listen(port, () =>
    console.log(`API Server is running at http://${host}:${port}/${prefix}`),
  );
}

bootstrap().catch((e) => console.error('Error starting server:', e));

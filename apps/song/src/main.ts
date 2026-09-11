import { NestFactory } from '@nestjs/core';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { loadEnvironment } from '@musical/shared-constants/environment';
import {
  GRPC_LOADER_OPTIONS,
  resolveProtoPath,
  SONG,
} from '@musical/shared-proto';

loadEnvironment();

const CATALOG_GRPC_MAX_MESSAGE_LENGTH = 16 * 1024 * 1024;

async function bootstrap() {
  const configService = new ConfigService();
  const url = configService.getOrThrow<string>('SONG_GRPC_URL');
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.GRPC,
      options: {
        package: SONG.PACKAGE,
        protoPath: resolveProtoPath(SONG.PROTO_FILE),
        url,
        loader: GRPC_LOADER_OPTIONS,
        maxSendMessageLength: CATALOG_GRPC_MAX_MESSAGE_LENGTH,
        maxReceiveMessageLength: CATALOG_GRPC_MAX_MESSAGE_LENGTH,
      },
    },
  );

  app.enableShutdownHooks();

  await app.listen();
  Logger.log(`Song gRPC server running at ${url}`);
}

bootstrap().catch((e) => Logger.error('Lỗi khi khởi động:', e));

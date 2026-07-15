import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import {
  GRPC_LOADER_OPTIONS,
  RECOMMENDATION,
  resolveProtoPath,
} from '@musical/shared-proto';
import { PrismaService } from './database/prisma.service';
import { Logger } from '@nestjs/common';

const API_GRPC_MAX_MESSAGE_LENGTH = 16 * 1024 * 1024;

async function bootstrap() {
  const configService = new ConfigService();
  const grpcUrl = configService.getOrThrow<string>('RECOMMENDATION_GRPC_URL');

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.GRPC,
      options: {
        package: RECOMMENDATION.PACKAGE,
        protoPath: resolveProtoPath(RECOMMENDATION.PROTO_FILE),
        url: grpcUrl,
        loader: GRPC_LOADER_OPTIONS,
        maxSendMessageLength: API_GRPC_MAX_MESSAGE_LENGTH,
        maxReceiveMessageLength: API_GRPC_MAX_MESSAGE_LENGTH,
      },
    },
  );

  const prisma = app.get(PrismaService);
  await prisma.$connect();

  app.enableShutdownHooks();

  await app.listen();

  Logger.log(`Recommendation gRPC server running at ${grpcUrl}`);
}

bootstrap().catch((e) => Logger.error('Lỗi khi khởi động:', e));

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import {
  RECOMMENDATION,
  resolveProtoPath,
} from '@musical/shared-proto';
import { PrismaService } from './database/prisma.service';
import { Logger } from '@nestjs/common';

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
        loader: { longs: Number },
      },
    },
  );

  const prisma = app.get(PrismaService);
  await prisma.$connect();

  await app.listen();

  Logger.log(`Recommendation gRPC server running at ${grpcUrl}`);
}

bootstrap().catch((e) => Logger.error('Lỗi khi khởi động:', e));

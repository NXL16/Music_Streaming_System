import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { IDENTITY, resolveProtoPath } from '@musical/shared-proto';
import { PrismaService } from './common/database/prisma.service';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const configService = new ConfigService();
  const grpcUrl = configService.getOrThrow<string>('IDENTITY_GRPC_URL');

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.GRPC,
      options: {
        package: IDENTITY.PACKAGE,
        protoPath: resolveProtoPath(IDENTITY.PROTO_FILE),
        url: grpcUrl,
        loader: { longs: Number },
      },
    },
  );

  app.enableShutdownHooks();

  const prisma = app.get(PrismaService);
  await prisma.$connect();

  await app.listen();

  Logger.log(`Identity gRPC server running at ${grpcUrl}`);
}

bootstrap().catch((e) => Logger.error('Lỗi khi khởi động:', e));

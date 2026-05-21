import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { IDENTITY } from '@musical/shared-proto';
import { PrismaService } from './common/database/prisma.service';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.GRPC,
      options: {
        package: IDENTITY.PACKAGE,
        protoPath: join(
          __dirname,
          '../../../../packages/shared-proto',
          IDENTITY.PROTO_FILE,
        ),
        url: IDENTITY.GRPC_URL,
        loader: { longs: Number },
      },
    },
  );

  app.enableShutdownHooks();

  const prisma = app.get(PrismaService);
  await prisma.$connect();

  await app.listen();

  Logger.log(`Identity gRPC server running at ${IDENTITY.GRPC_URL}`);
}

bootstrap().catch((e) => Logger.error('Lỗi khi khởi động:', e));

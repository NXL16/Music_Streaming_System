import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { SONG } from '@musical/shared-proto';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.GRPC,
      options: {
        package: SONG.PACKAGE,
        protoPath: join(
          __dirname,
          '../../../../packages/shared-proto/',
          SONG.PROTO_FILE,
        ),
        url: '0.0.0.0:7777',
      },
    },
  );

  await app.listen();
  Logger.log(`Song gRPC server running at 0.0.0.0:7777`);
}

bootstrap().catch((e) => console.error(e));

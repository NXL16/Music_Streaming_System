import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.GRPC,
      options: {
        // Cổng nội bộ cho gRPC
        url: '0.0.0.0:5000',
        package: 'musicstreaming',
        protoPath: join(__dirname, '../proto/key-management.proto'),
        loader: {
          keepCase: true,
        },
      },
    },
  );

  await app.listen();
  console.log('KMS Microservice is listening on gRPC port 5000');
}
bootstrap().catch((e) => console.log(e));

import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { KmsService } from './kms.service';
import { KmsController } from './kms.controller';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'KMS_PACKAGE', // Tên token để Inject vào Service
        transport: Transport.GRPC,
        options: {
          url: 'localhost:5000', // Cổng của KMS Microservice
          package: 'musicstreaming', // Phải khớp với `package musicstreaming;` trong .proto
          protoPath: join(__dirname, '../../proto/key-management.proto'),
          loader: {
            keepCase: true,
          },
        },
      },
    ]),
  ],
  controllers: [KmsController],
  providers: [KmsService],
  exports: [KmsService],
})
export class KmsModule {}

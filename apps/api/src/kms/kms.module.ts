import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { KmsService } from './kms.service';
import { KmsController } from './kms.controller';
import { KMS } from '@musical/shared-proto';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'KMS_PACKAGE',
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            url: configService.get<string>('KMS_GRPC_URL'),
            package: KMS.PACKAGE,
            protoPath: join(
              __dirname,
              '../../../../packages/shared-proto',
              KMS.PROTO_FILE,
            ),
          },
        }),
      },
    ]),
  ],
  controllers: [KmsController],
  providers: [KmsService],
  exports: [KmsService],
})
export class KmsModule {}

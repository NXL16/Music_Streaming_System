import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MetadataController } from './metadata.controller';
import { MetadataService } from './metadata.service';
import { METADATA, resolveProtoPath } from '@musical/shared-proto';

@Module({
  imports: [
    ConfigModule,
    ClientsModule.registerAsync([
      {
        name: 'METADATA_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            url: config.getOrThrow<string>('META_GRPC_URL'),
            package: METADATA.PACKAGE,
            protoPath: resolveProtoPath(METADATA.PROTO_FILE),
            loader: { longs: Number },
          },
        }),
      },
    ]),
  ],
  controllers: [MetadataController],
  providers: [MetadataService],
  exports: [MetadataService],
})
export class MetadataModule {}

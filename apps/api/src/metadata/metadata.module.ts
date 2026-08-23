import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MetadataController } from './metadata.controller';
import { MetadataService } from './metadata.service';
import { PlaybackAccessModule } from '../playback-access/playback-access.module';
import {
  GRPC_LOADER_OPTIONS,
  METADATA,
  resolveProtoPath,
} from '@musical/shared-proto';
import { metadataGrpcChannelCredentials } from './metadata-grpc-tls';

// Meta accepts up to 100k seek segments and waveform samples. Keep this in
// sync with the Go server and Rust worker so valid large tracks do not fail at
// the transport's smaller default message limit.
const MAX_METADATA_GRPC_MESSAGE_BYTES = 8 * 1024 * 1024;

@Module({
  imports: [
    ConfigModule,
    PlaybackAccessModule,
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
            loader: GRPC_LOADER_OPTIONS,
            credentials: metadataGrpcChannelCredentials(config),
            maxSendMessageLength: MAX_METADATA_GRPC_MESSAGE_BYTES,
            maxReceiveMessageLength: MAX_METADATA_GRPC_MESSAGE_BYTES,
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

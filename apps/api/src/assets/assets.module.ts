import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import {
  ASSET,
  GRPC_LOADER_OPTIONS,
  resolveProtoPath,
} from '@musical/shared-proto';
import {
  ArtistStudioAssetsController,
  AssetsController,
} from './assets.controller';
import { AssetsService } from './assets.service';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'ASSET_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            url: config.getOrThrow<string>('ASSET_GRPC_URL'),
            package: ASSET.PACKAGE,
            protoPath: resolveProtoPath(ASSET.PROTO_FILE),
            loader: GRPC_LOADER_OPTIONS,
          },
        }),
      },
    ]),
  ],
  controllers: [AssetsController, ArtistStudioAssetsController],
  providers: [AssetsService],
})
export class AssetsModule {}

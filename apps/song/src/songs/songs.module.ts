import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import {
  ASSET,
  GRPC_LOADER_OPTIONS,
  resolveProtoPath,
} from '@musical/shared-proto';
import { SongsService } from './songs.service';
import { SongsController } from './songs.controller';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../common/redis/redis.module';
import { CompletionService } from './completion.service';
import { PendingCleanupService } from './pending-cleanup.service';
import { AssetCleanupService } from './asset-cleanup.service';
import { CatalogService } from './catalog.service';
import { CatalogAuthoringService } from './catalog-authoring.service';
import { CatalogAssetsService } from './catalog-assets.service';
import { CatalogAssetUsageOutboxService } from './catalog-asset-usage-outbox.service';

@Module({
  imports: [
    DatabaseModule,
    RedisModule,
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
  controllers: [SongsController],
  providers: [
    SongsService,
    CompletionService,
    PendingCleanupService,
    AssetCleanupService,
    CatalogService,
    CatalogAuthoringService,
    CatalogAssetsService,
    CatalogAssetUsageOutboxService,
  ],
})
export class SongsModule {}

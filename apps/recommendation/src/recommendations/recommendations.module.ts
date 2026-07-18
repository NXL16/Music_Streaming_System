import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import {
  GRPC_LOADER_OPTIONS,
  resolveProtoPath,
  SONG,
} from '@musical/shared-proto';
import { DatabaseModule } from '../database/database.module';
import { ListeningModule } from '../listening/listening.module';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';
import { InternalGrpcGuard } from '../common/guards/internal-grpc.guard';
import { RecommendationCatalogService } from './recommendation-catalog.service';
import { GenerationService } from '../generation/generation.service';
import { CatalogSynchronizationService } from './catalog-synchronization.service';
import { RecommendationEngineService } from '../generation/recommendation-engine.service';

@Module({
  imports: [
    DatabaseModule,
    ListeningModule,
    ClientsModule.registerAsync([
      {
        name: 'SONG_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            url: config.getOrThrow<string>('SONG_GRPC_URL'),
            package: SONG.PACKAGE,
            protoPath: resolveProtoPath(SONG.PROTO_FILE),
            loader: GRPC_LOADER_OPTIONS,
          },
        }),
      },
    ]),
  ],
  controllers: [RecommendationsController],
  providers: [
    RecommendationsService,
    RecommendationCatalogService,
    CatalogSynchronizationService,
    GenerationService,
    RecommendationEngineService,
    InternalGrpcGuard,
  ],
  exports: [RecommendationsService],
})
export class RecommendationModule {}

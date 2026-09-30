import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import {
  GRPC_LOADER_OPTIONS,
  ASSET,
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
import { RecommendationRpcMetricsService } from '../common/observability/recommendation-rpc-metrics.service';
import { RecommendationRpcMetricsInterceptor } from '../common/observability/recommendation-rpc-metrics.interceptor';
import { SystemStationArtworkService } from './system-station-artwork.service';
import { SystemPlaylistArtworkService } from './system-playlist-artwork.service';
import { GenerationLeaseService } from '../generation/generation-lease.service';
import { PreferencesModule } from '../preferences/preferences.module';
import { QdrantAudioVectorService } from '../vector/qdrant-audio-vector.service';
import { AudioVectorSynchronizationService } from '../vector/audio-vector-synchronization.service';
import { SongStationService } from '../stations/song-station.service';
import { ArtistStationService } from '../stations/artist-station.service';
import { StationTrackSelectionService } from '../stations/station-track-selection.service';
import { SystemStationRefreshService } from '../generation/system-station-refresh.service';

const CATALOG_GRPC_MAX_MESSAGE_LENGTH = 16 * 1024 * 1024;

@Module({
  imports: [
    DatabaseModule,
    ListeningModule,
    PreferencesModule,
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
            maxSendMessageLength: CATALOG_GRPC_MAX_MESSAGE_LENGTH,
            maxReceiveMessageLength: CATALOG_GRPC_MAX_MESSAGE_LENGTH,
          },
        }),
      },
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
  controllers: [RecommendationsController],
  providers: [
    RecommendationsService,
    RecommendationCatalogService,
    CatalogSynchronizationService,
    GenerationService,
    SystemStationRefreshService,
    GenerationLeaseService,
    RecommendationEngineService,
    RecommendationRpcMetricsService,
    RecommendationRpcMetricsInterceptor,
    SystemStationArtworkService,
    SystemPlaylistArtworkService,
    QdrantAudioVectorService,
    AudioVectorSynchronizationService,
    SongStationService,
    ArtistStationService,
    StationTrackSelectionService,
    InternalGrpcGuard,
  ],
  exports: [RecommendationsService],
})
export class RecommendationModule {}

import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  GRPC_LOADER_OPTIONS,
  RECOMMENDATION,
  resolveProtoPath,
} from '@musical/shared-proto';
import {
  RecommendationAdminController,
  RecommendationsController,
} from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';
import { AssetsModule } from '../assets/assets.module';
import { SongStationArtworkService } from './song-station-artwork.service';
import { ArtistStationArtworkService } from './artist-station-artwork.service';
import { AuthModule } from '../auth/auth.module';

const RECOMMENDATION_GRPC_MAX_MESSAGE_LENGTH = 16 * 1024 * 1024;

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    AssetsModule,
    ClientsModule.registerAsync([
      {
        name: 'RECOMMENDATION_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            url: config.getOrThrow<string>('RECOMMENDATION_GRPC_URL'),
            package: RECOMMENDATION.PACKAGE,
            protoPath: resolveProtoPath(RECOMMENDATION.PROTO_FILE),
            loader: GRPC_LOADER_OPTIONS,
            maxSendMessageLength: RECOMMENDATION_GRPC_MAX_MESSAGE_LENGTH,
            maxReceiveMessageLength: RECOMMENDATION_GRPC_MAX_MESSAGE_LENGTH,
          },
        }),
      },
    ]),
  ],
  controllers: [RecommendationsController, RecommendationAdminController],
  providers: [RecommendationsService, SongStationArtworkService, ArtistStationArtworkService],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}

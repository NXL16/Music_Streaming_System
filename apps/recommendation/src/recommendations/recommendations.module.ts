import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { resolveProtoPath, SONG } from '@musical/shared-proto';
import { DatabaseModule } from '../database/database.module';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';
import { InternalGrpcGuard } from '../common/guards/internal-grpc.guard';
import { RecommendationCatalogService } from './recommendation-catalog.service';

@Module({
  imports: [
    DatabaseModule,
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
            loader: { longs: Number },
          },
        }),
      },
    ]),
  ],
  controllers: [RecommendationsController],
  providers: [
    RecommendationsService,
    RecommendationCatalogService,
    InternalGrpcGuard,
  ],
  exports: [RecommendationsService],
})
export class RecommendationModule {}

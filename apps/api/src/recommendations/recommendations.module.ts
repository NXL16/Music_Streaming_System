import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { RECOMMENDATION } from '@musical/shared-proto';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';

@Module({
  imports: [
    ConfigModule,
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
            protoPath: join(
              __dirname,
              '../../../../packages/shared-proto',
              RECOMMENDATION.PROTO_FILE,
            ),
            loader: { longs: Number },
          },
        }),
      },
    ]),
  ],
  controllers: [RecommendationsController],
  providers: [RecommendationsService],
})
export class RecommendationsModule {}
